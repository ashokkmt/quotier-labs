package sqlite

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// NewDB opens (or creates) a SQLite database at the given DSN, configures
// required PRAGMAs, and runs all pending schema migrations. The migrations
// are embedded in the binary, so no external file paths are needed.
func NewDB(dsn string) (*gorm.DB, error) {
	if err := migrateStaged(dsn); err != nil {
		return nil, err
	}
	logLevel := logger.Warn
	if os.Getenv("SQL_DEBUG") == "1" || os.Getenv("SQL_DEBUG") == "true" {
		logLevel = logger.Info
	}
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		// SQL is opt-in. Errors and slow queries remain visible at Warn;
		// SQL_DEBUG=1 enables statement-level diagnostics for development.
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("get underlying sql.DB: %w", err)
	}

	// PRAGMA config for SQLite — must be set before migrations so that
	// foreign key constraints are enforced during migration runs.
	if _, err := sqlDB.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, fmt.Errorf("pragma foreign_keys: %w", err)
	}
	if _, err := sqlDB.Exec("PRAGMA journal_mode = WAL"); err != nil {
		return nil, fmt.Errorf("pragma journal_mode: %w", err)
	}
	if _, err := sqlDB.Exec("PRAGMA synchronous = NORMAL"); err != nil {
		return nil, fmt.Errorf("pragma synchronous: %w", err)
	}
	if _, err := sqlDB.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		return nil, fmt.Errorf("pragma busy_timeout: %w", err)
	}

	// Run migrations. This is idempotent — already-applied migrations are
	// tracked by goose's goose_db_version table and skipped.
	if err := RunMigrations(sqlDB); err != nil {
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	return db, nil
}

// migrateStaged applies pending migrations to a consistent database copy and
// promotes it only after integrity checks. The original generation is retained
// as a rollback snapshot instead of being partially modified in place.
func migrateStaged(dsn string) error {
	info, err := os.Stat(dsn)
	if errorsIsNotExist(err) || (err == nil && info.Size() == 0) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect sqlite database: %w", err)
	}
	source, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return fmt.Errorf("open migration source: %w", err)
	}
	defer source.Close()
	current, err := CurrentSchemaVersion(source)
	if err != nil {
		return fmt.Errorf("read current schema version: %w", err)
	}
	target, err := TargetSchemaVersion()
	if err != nil {
		return err
	}
	if current > target {
		return fmt.Errorf("database schema %d is newer than this application supports (%d)", current, target)
	}
	if current == target {
		return nil
	}
	if _, err := source.Exec(`PRAGMA wal_checkpoint(FULL)`); err != nil {
		return fmt.Errorf("checkpoint database before migration: %w", err)
	}
	dir := filepath.Dir(dsn)
	required := uint64(info.Size())*2 + uint64(64<<20)
	available, err := availableDiskBytes(dir)
	if err != nil {
		return fmt.Errorf("check free space before migration: %w", err)
	}
	if available < required {
		return fmt.Errorf("insufficient free space for safe database migration")
	}
	stage, err := os.CreateTemp(dir, ".migration-*.sqlite3")
	if err != nil {
		return fmt.Errorf("create migration stage: %w", err)
	}
	stagePath := stage.Name()
	_ = stage.Close()
	_ = os.Remove(stagePath)
	defer os.Remove(stagePath)
	escaped := strings.ReplaceAll(stagePath, "'", "''")
	if _, err := source.Exec("VACUUM INTO '" + escaped + "'"); err != nil {
		return fmt.Errorf("stage database migration: %w", err)
	}
	staged, err := sql.Open("sqlite3", stagePath)
	if err != nil {
		return fmt.Errorf("open staged database: %w", err)
	}
	if err := RunMigrations(staged); err != nil {
		_ = staged.Close()
		return fmt.Errorf("migrate staged database: %w", err)
	}
	var integrity string
	if err := staged.QueryRow(`PRAGMA integrity_check`).Scan(&integrity); err != nil || integrity != "ok" {
		_ = staged.Close()
		return fmt.Errorf("staged database integrity check failed: %s", integrity)
	}
	var foreignKeyViolations int
	rows, err := staged.Query(`PRAGMA foreign_key_check`)
	if err == nil {
		if rows.Next() {
			foreignKeyViolations = 1
		}
		_ = rows.Close()
	}
	if err != nil || foreignKeyViolations != 0 {
		_ = staged.Close()
		return fmt.Errorf("staged database foreign-key validation failed")
	}
	if err := staged.Close(); err != nil {
		return err
	}
	if err := source.Close(); err != nil {
		return err
	}
	_ = os.Remove(dsn + "-wal")
	_ = os.Remove(dsn + "-shm")
	rollback := fmt.Sprintf("%s.rollback-%s", dsn, time.Now().UTC().Format("20060102T150405Z"))
	if err := os.Rename(dsn, rollback); err != nil {
		return fmt.Errorf("preserve pre-migration database: %w", err)
	}
	if err := os.Rename(stagePath, dsn); err != nil {
		_ = os.Rename(rollback, dsn)
		return fmt.Errorf("promote migrated database: %w", err)
	}
	_ = os.Chmod(dsn, 0600)
	return nil
}

func errorsIsNotExist(err error) bool { return err != nil && os.IsNotExist(err) }

package sqlite

import (
	"fmt"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// NewDB opens (or creates) a SQLite database at the given DSN, configures
// required PRAGMAs, and runs all pending schema migrations. The migrations
// are embedded in the binary, so no external file paths are needed.
func NewDB(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
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

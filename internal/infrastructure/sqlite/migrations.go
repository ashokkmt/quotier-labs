package sqlite

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/pressly/goose/v3"
	"quotierlabs/migrations"
)

var migrationName = regexp.MustCompile(`^(\d+)_.*\.sql$`)

// TargetSchemaVersion returns the highest migration embedded in this binary.
func TargetSchemaVersion() (int64, error) {
	entries, err := migrations.FS.ReadDir(".")
	if err != nil {
		return 0, fmt.Errorf("read embedded migrations: %w", err)
	}
	var highest int64
	for _, entry := range entries {
		match := migrationName.FindStringSubmatch(filepath.Base(entry.Name()))
		if len(match) != 2 {
			continue
		}
		value, err := strconv.ParseInt(match[1], 10, 64)
		if err == nil && value > highest {
			highest = value
		}
	}
	return highest, nil
}

func CurrentSchemaVersion(db *sql.DB) (int64, error) {
	var exists int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='goose_db_version'`).Scan(&exists); err != nil {
		return 0, err
	}
	if exists == 0 {
		return 0, nil
	}
	var version int64
	if err := db.QueryRow(`SELECT COALESCE(MAX(version_id), 0) FROM goose_db_version WHERE is_applied = 1`).Scan(&version); err != nil {
		return 0, err
	}
	return version, nil
}

// RunMigrations applies all pending SQL migrations using the embedded migration
// files from the root migrations/ package. It is idempotent: already-applied
// migrations are tracked by goose's goose_db_version table and skipped.
func RunMigrations(db *sql.DB) error {
	goose.SetBaseFS(migrations.FS)
	defer goose.SetBaseFS(nil)

	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("goose set dialect: %w", err)
	}

	// "." because migrations.FS is rooted at the SQL files directly.
	if err := goose.Up(db, "."); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}

	return nil
}

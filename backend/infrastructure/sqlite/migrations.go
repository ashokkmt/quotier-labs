package sqlite

import (
	"database/sql"
	"fmt"

	"github.com/pressly/goose/v3"
	"quotierlabs/migrations"
)

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

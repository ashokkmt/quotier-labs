package tests

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/pressly/goose/v3"
)

func TestMigrations(t *testing.T) {
	db, err := sql.Open("sqlite3", "file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("failed to open memory db: %v", err)
	}
	defer db.Close()

	// Configure goose
	goose.SetBaseFS(nil) // Use os filesystem for migrations directory
	_ = goose.SetDialect("sqlite3")

	// Apply migrations
	err = goose.Up(db, "../migrations")
	if err != nil {
		// Expect an error if there are no migrations yet, which is fine for Phase 0 setup
		if err.Error() != "no migration files found" {
			t.Fatalf("goose up failed: %v", err)
		}
	}
}

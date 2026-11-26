package sqlite

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/pressly/goose/v3"
	"quotierlabs/migrations"
)

func TestNewDBMigratesThroughStagedGeneration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "quotierlabs.sqlite3")
	sqlDB, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	goose.SetBaseFS(migrations.FS)
	defer goose.SetBaseFS(nil)
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpTo(sqlDB, ".", 10); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`INSERT INTO companies (id, name, currency, is_active, created_at, updated_at, version) VALUES ('company-test', 'Migration Fixture', 'INR', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.Exec(`INSERT INTO section_definitions (id, name, schema, schema_version, is_builtin, created_at, updated_at, version) VALUES ('legacy-section', 'Legacy', '{}', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`); err != nil {
		t.Fatal(err)
	}
	_ = sqlDB.Close()

	migrated, err := NewDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { db, _ := migrated.DB(); _ = db.Close() }()
	var name string
	if err := migrated.Raw(`SELECT name FROM companies WHERE id = 'company-test'`).Scan(&name).Error; err != nil || name != "Migration Fixture" {
		t.Fatalf("staged migration lost existing data: name=%q err=%v", name, err)
	}
	var sectionTableCount int64
	if err := migrated.Raw(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'section_definitions'`).Scan(&sectionTableCount).Error; err != nil {
		t.Fatal(err)
	}
	if sectionTableCount != 0 {
		t.Fatal("legacy section_definitions table still exists after migration 011")
	}
	rollbacks, _ := filepath.Glob(path + ".rollback-*")
	if len(rollbacks) != 1 {
		t.Fatalf("expected one preserved pre-migration database, got %d", len(rollbacks))
	}
}

func TestNewDBRejectsNewerSchema(t *testing.T) {
	path := filepath.Join(t.TempDir(), "newer.sqlite3")
	db, err := NewDB(path)
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	if _, err := sqlDB.Exec(`INSERT INTO goose_db_version (version_id, is_applied, tstamp) VALUES (999, 1, CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	_ = sqlDB.Close()
	if _, err := NewDB(path); err == nil {
		t.Fatal("expected newer schema to be rejected")
	}
}

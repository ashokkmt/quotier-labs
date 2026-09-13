package backup_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	backup_domain "quotierlabs/backend/domain/backup"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/documentv6"
	"quotierlabs/backend/infrastructure/apppaths"
	"quotierlabs/backend/infrastructure/backup"
)

func TestBackupAndRestore(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "quotierlabs_test_backup_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "source.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open source db: %v", err)
	}

	// Create dummy table and data
	db.Exec("CREATE TABLE dummy (id INTEGER PRIMARY KEY, name TEXT)")
	db.Exec("INSERT INTO dummy (name) VALUES ('test-record')")

	svc := backup.NewSQLiteBackupService(db, apppaths.Paths{TempRoot: tempDir})

	backupPath := filepath.Join(tempDir, "backup.zip")
	meta := backup_domain.BackupMetadata{
		FormatVersion: 1,
		AppVersion:    "1.0.0",
		SchemaVersion: 9,
		CompanyID:     "comp-1",
		CompanyName:   "Test",
		CreatedAt:     time.Now(),
	}

	// 1. Create Backup
	assetsRoot := filepath.Join(tempDir, "assets")
	if err := os.MkdirAll(assetsRoot, 0700); err != nil {
		t.Fatal(err)
	}
	info, err := svc.CreateBackup(context.Background(), backupPath, meta, assetsRoot)
	if err != nil {
		t.Fatalf("create backup failed: %v", err)
	}
	if info.Size == 0 {
		t.Errorf("expected backup size > 0")
	}

	// 2. Validate Backup
	valRes, err := svc.ValidateBackup(context.Background(), backupPath)
	if err != nil {
		t.Fatalf("validate backup failed: %v", err)
	}
	if !valRes.IsValid {
		t.Errorf("expected backup to be valid, got error: %s", valRes.Error)
	}
	if valRes.Info.Metadata.CompanyName != "Test" {
		t.Errorf("expected metadata company Test, got %s", valRes.Info.Metadata.CompanyName)
	}

	// 3. Restore Backup to a new path
	restorePath := filepath.Join(tempDir, "restored.db")
	// For testing, we pass restorePath as the currentDBPath.
	err = svc.RestoreBackup(context.Background(), backupPath, restorePath, filepath.Join(tempDir, "restored-assets"))
	if err != nil {
		t.Fatalf("restore backup failed: %v", err)
	}

	// 4. Verify restored data
	restoredDB, err := gorm.Open(sqlite.Open(restorePath), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open restored db: %v", err)
	}

	var name string
	err = restoredDB.Raw("SELECT name FROM dummy LIMIT 1").Scan(&name).Error
	if err != nil || name != "test-record" {
		t.Fatalf("failed to read from restored db, name=%s, err=%v", name, err)
	}
}

func TestBackupRestorePreservesMixedDocumentSchemasAndAssets(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "source.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TABLE documents (id TEXT PRIMARY KEY, payload TEXT NOT NULL)").Error; err != nil {
		t.Fatal(err)
	}
	v5, err := json.Marshal(documentmodel.NewBlank("v5-page"))
	if err != nil {
		t.Fatal(err)
	}
	v6, err := json.Marshal(documentv6.NewBlank("v6-paragraph"))
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []struct{ id, payload string }{{"v5", string(v5)}, {"v6", string(v6)}} {
		if err := db.Exec("INSERT INTO documents (id, payload) VALUES (?, ?)", value.id, value.payload).Error; err != nil {
			t.Fatal(err)
		}
	}
	assets := filepath.Join(tempDir, "assets")
	if err := os.MkdirAll(assets, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(assets, "logo.png"), []byte("asset bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	svc := backup.NewSQLiteBackupService(db, apppaths.Paths{TempRoot: tempDir})
	archive := filepath.Join(tempDir, "mixed.zip")
	if _, err := svc.CreateBackup(context.Background(), archive, backup_domain.BackupMetadata{FormatVersion: 1, AppVersion: "test", SchemaVersion: 1, CompanyID: "comp", CreatedAt: time.Now()}, assets); err != nil {
		t.Fatal(err)
	}
	restoredDBPath := filepath.Join(tempDir, "restored.db")
	restoredAssets := filepath.Join(tempDir, "restored-assets")
	if err := svc.RestoreBackup(context.Background(), archive, restoredDBPath, restoredAssets); err != nil {
		t.Fatal(err)
	}
	restored, err := gorm.Open(sqlite.Open(restoredDBPath), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []struct{ id, payload string }{{"v5", string(v5)}, {"v6", string(v6)}} {
		var got string
		if err := restored.Raw("SELECT payload FROM documents WHERE id = ?", value.id).Scan(&got).Error; err != nil || got != value.payload {
			t.Fatalf("%s payload was not preserved: %v", value.id, err)
		}
	}
	if raw, err := os.ReadFile(filepath.Join(restoredAssets, "logo.png")); err != nil || string(raw) != "asset bytes" {
		t.Fatalf("managed asset was not preserved: %v", err)
	}
}

func TestValidateInvalidBackup(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "quotierlabs_test_invalid_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	invalidZipPath := filepath.Join(tempDir, "invalid.zip")
	_ = os.WriteFile(invalidZipPath, []byte("not a zip file"), 0644)

	svc := backup.NewSQLiteBackupService(nil, apppaths.Paths{TempRoot: tempDir})
	valRes, err := svc.ValidateBackup(context.Background(), invalidZipPath)
	if err != nil {
		t.Fatalf("unexpected error validating invalid zip: %v", err)
	}
	if valRes.IsValid {
		t.Errorf("expected validation to fail for invalid zip")
	}
}

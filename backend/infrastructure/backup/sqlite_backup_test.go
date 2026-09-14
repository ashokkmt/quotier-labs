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
	db.Exec("CREATE TABLE templates (id TEXT PRIMARY KEY, layout TEXT NOT NULL)")
	document, err := json.Marshal(documentv6.NewBlank("backup-paragraph"))
	if err != nil {
		t.Fatal(err)
	}
	db.Exec("INSERT INTO templates (id, layout) VALUES ('template', ?)", string(document))

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
	var restoredDocument string
	if err := restoredDB.Raw("SELECT layout FROM templates WHERE id = 'template'").Scan(&restoredDocument).Error; err != nil || restoredDocument != string(document) {
		t.Fatalf("document was not restored: %v", err)
	}
}

func TestBackupRejectsRetiredDocumentSchema(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "source.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TABLE templates (id TEXT PRIMARY KEY, layout TEXT NOT NULL)").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("INSERT INTO templates (id, layout) VALUES ('retired', ?)", `{"schema_version":5}`).Error; err != nil {
		t.Fatal(err)
	}
	assets := filepath.Join(tempDir, "assets")
	if err := os.MkdirAll(assets, 0700); err != nil {
		t.Fatal(err)
	}
	svc := backup.NewSQLiteBackupService(db, apppaths.Paths{TempRoot: tempDir})
	archive := filepath.Join(tempDir, "retired.zip")
	if _, err := svc.CreateBackup(context.Background(), archive, backup_domain.BackupMetadata{FormatVersion: 1, AppVersion: "test", SchemaVersion: 1, CompanyID: "comp", CreatedAt: time.Now()}, assets); err == nil {
		t.Fatal("backup containing a retired document schema was accepted")
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

package backup_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	backup_domain "quotierlabs/backend/domain/backup"
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

	svc := backup.NewSQLiteBackupService(db)

	backupPath := filepath.Join(tempDir, "backup.zip")
	meta := backup_domain.BackupMetadata{
		AppVersion:    "1.0.0",
		SchemaVersion: 9,
		CompanyID:     "comp-1",
		CompanyName:   "Test",
		CreatedAt:     time.Now(),
	}

	// 1. Create Backup
	info, err := svc.CreateBackup(context.Background(), backupPath, meta)
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
	err = svc.RestoreBackup(context.Background(), backupPath, restorePath)
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

func TestValidateInvalidBackup(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "quotierlabs_test_invalid_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	invalidZipPath := filepath.Join(tempDir, "invalid.zip")
	os.WriteFile(invalidZipPath, []byte("not a zip file"), 0644)

	svc := backup.NewSQLiteBackupService(nil)
	valRes, err := svc.ValidateBackup(context.Background(), invalidZipPath)
	if err != nil {
		t.Fatalf("unexpected error validating invalid zip: %v", err)
	}
	if valRes.IsValid {
		t.Errorf("expected validation to fail for invalid zip")
	}
}

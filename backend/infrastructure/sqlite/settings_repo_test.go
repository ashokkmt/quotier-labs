package sqlite_test

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"quotierlabs/backend/domain"
	infra_sqlite "quotierlabs/backend/infrastructure/sqlite"
)

func TestSettingsRepositoryMissingOptionalSettingIsSilentAndUsesDomainNotFound(t *testing.T) {
	t.Parallel()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	sqlDB, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open sql database: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := infra_sqlite.RunMigrations(sqlDB); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	var sink bytes.Buffer
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.New(log.New(&sink, "", 0), logger.Config{LogLevel: logger.Error}),
	})
	if err != nil {
		t.Fatalf("open gorm database: %v", err)
	}
	if err := db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?)", "company-1", "Test", "INR", time.Now(), time.Now(), 1).Error; err != nil {
		t.Fatalf("create company: %v", err)
	}

	repo := infra_sqlite.NewSettingsRepository(db)
	_, err = repo.Get(context.Background(), "company-1", "auto_backup_enabled")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get() error = %v, want domain.ErrNotFound", err)
	}
	if err := repo.Set(context.Background(), &domain.Settings{
		ID: "setting-1", CompanyID: "company-1", Key: "auto_backup_enabled", Value: "true",
		AuditMetadata: domain.AuditMetadata{CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(), Version: 1},
	}); err != nil {
		t.Fatalf("Set() initial value error = %v", err)
	}
	if strings.Contains(sink.String(), "record not found") {
		t.Fatal("normal missing settings must not be logged by GORM as record not found")
	}
}

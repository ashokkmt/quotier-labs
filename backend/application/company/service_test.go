package company_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/pressly/goose/v3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"quotierlabs/backend/application/company"
	infra_id "quotierlabs/backend/infrastructure/id"
	infra_sqlite "quotierlabs/backend/infrastructure/sqlite"
)

func setupTestDB(t *testing.T) *gorm.DB {
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared"
	sqlDB, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("failed to open sql db: %v", err)
	}

	_ = goose.SetDialect("sqlite3")
	if err := goose.Up(sqlDB, "../../../migrations"); err != nil {
		t.Fatalf("goose up failed: %v", err)
	}

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open gorm db: %v", err)
	}

	conn, _ := db.DB()
	conn.SetMaxOpenConns(1)
	_, _ = conn.Exec("PRAGMA foreign_keys = ON")

	return db
}

func TestCompanyService(t *testing.T) {
	db := setupTestDB(t)
	repo := infra_sqlite.NewCompanyRepository(db)
	idGen := infra_id.NewULIDGenerator()
	svc := company.NewService(repo, idGen)

	ctx := context.Background()

	// IsFirstRun should be true
	isFirst, err := svc.IsFirstRun(ctx)
	if err != nil {
		t.Fatalf("IsFirstRun failed: %v", err)
	}
	if !isFirst {
		t.Fatalf("expected true for first run")
	}

	state := "MH"
	email := "test@example.com"
	input := company.CompanyCreateDTO{
		Name:  "Test",
		State: &state,
		Email: &email,
	}

	// Create
	comp, err := svc.CreateCompany(ctx, input)
	if err != nil {
		t.Fatalf("failed to create: %v", err)
	}

	if comp.Name != "Test" || comp.Currency != "INR" {
		t.Fatalf("invalid mapped dto")
	}

	// IsFirstRun should be false
	isFirst, _ = svc.IsFirstRun(ctx)
	if isFirst {
		t.Fatalf("expected false for first run after creation")
	}

	// Get Active
	active, err := svc.GetActiveCompany(ctx)
	if err != nil || active.ID != comp.ID {
		t.Fatalf("failed to get active company")
	}

	// Update
	newName := "Test Updated"
	active.Name = newName
	updated, err := svc.UpdateCompany(ctx, company.CompanyUpdateDTO{
		ID:    active.ID,
		Name:  newName,
		State: active.State,
	})
	if err != nil || updated.Name != newName {
		t.Fatalf("failed to update")
	}
}

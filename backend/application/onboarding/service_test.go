package onboarding_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/pressly/goose/v3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"quotierlabs/backend/application/company"
	"quotierlabs/backend/application/onboarding"
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

func TestCompleteOnboarding(t *testing.T) {
	db := setupTestDB(t)
	compRepo := infra_sqlite.NewCompanyRepository(db)
	tmplRepo := infra_sqlite.NewTemplateRepository(db)
	txManager := infra_sqlite.NewGormTxManager(db)
	idGen := infra_id.NewULIDGenerator()

	compSvc := company.NewService(compRepo, idGen)
	svc := onboarding.NewService(compSvc, txManager, tmplRepo, infra_sqlite.NewNumberSequenceRepository(db), idGen)

	ctx := context.Background()
	state := "MH"

	err := svc.CompleteOnboarding(ctx, company.CompanyCreateDTO{
		Name:  "Onboarding Test",
		State: &state,
	})
	if err != nil {
		t.Fatalf("CompleteOnboarding failed: %v", err)
	}

	// Verify company created
	isFirst, _ := compSvc.IsFirstRun(ctx)
	if isFirst {
		t.Fatalf("expected IsFirstRun false")
	}

	tmpl, _ := tmplRepo.ListBuiltins(ctx)
	if len(tmpl) != len(onboarding.BuiltinTemplates) {
		t.Fatalf("expected %d template builtins, got %d", len(onboarding.BuiltinTemplates), len(tmpl))
	}
}

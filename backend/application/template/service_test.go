package template_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/pressly/goose/v3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"quotierlabs/backend/application/template"
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

func TestTemplateService(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test Comp', 'INR', ?, ?, 1)", time.Now(), time.Now())

	repo := infra_sqlite.NewTemplateRepository(db)
	txManager := infra_sqlite.NewGormTxManager(db)
	idGen := infra_id.NewULIDGenerator()
	svc := template.NewService(repo, txManager, idGen)
	ctx := context.Background()

	// 1. Create builtin directly
	builtinID := idGen.Generate()
	db.Exec("INSERT INTO templates (id, name, is_builtin, layout, schema_version, current_version, created_at, updated_at, version) VALUES (?, 'BuiltinTmpl', 1, '{\"rows\":[]}', 1, 1, ?, ?, 1)", builtinID, time.Now(), time.Now())

	// 2. Duplicate Builtin
	cloned, err := svc.DuplicateTemplate(ctx, "comp-1", builtinID)
	if err != nil {
		t.Fatalf("failed to duplicate builtin: %v", err)
	}
	if cloned.Name != "BuiltinTmpl (Copy)" {
		t.Fatalf("expected cloned name, got %s", cloned.Name)
	}
	if cloned.CurrentVersion != 1 {
		t.Fatalf("expected cloned version 1")
	}

	// 3. Create Custom
	custom, err := svc.CreateTemplate(ctx, "comp-1", template.TemplateCreateDTO{
		Name:   "Custom Tmpl",
		Layout: `{"rows":[]}`,
	})
	if err != nil {
		t.Fatalf("failed to create custom: %v", err)
	}

	// 4. Update Custom (should bump version)
	updated, err := svc.UpdateTemplate(ctx, "comp-1", template.TemplateUpdateDTO{
		ID:     custom.ID,
		Name:   "Updated Custom Tmpl",
		Layout: `{"rows":[]}`,
	})
	if err != nil || updated.Name != "Updated Custom Tmpl" {
		t.Fatalf("failed to update custom")
	}
	if updated.CurrentVersion != 2 {
		t.Fatalf("expected version bumped to 2")
	}

	// 5. Delete Builtin should fail
	err = svc.DeleteTemplate(ctx, "comp-1", builtinID)
	if err != template.ErrCannotModifyBuiltin {
		t.Fatalf("expected ErrCannotModifyBuiltin, got: %v", err)
	}

	// 6. Delete Custom should succeed
	err = svc.DeleteTemplate(ctx, "comp-1", custom.ID)
	if err != nil {
		t.Fatalf("failed to delete custom: %v", err)
	}

	// 7. List should have builtin and clone
	list, err := svc.ListTemplates(ctx, "comp-1")
	if err != nil || len(list) != 2 {
		t.Fatalf("expected 2 templates, got %d", len(list))
	}
}

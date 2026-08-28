package section_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/pressly/goose/v3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"quotierlabs/backend/application/section"
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

func TestSectionService(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test Comp', 'INR', ?, ?, 1)", time.Now(), time.Now())

	repo := infra_sqlite.NewSectionDefinitionRepository(db)
	idGen := infra_id.NewULIDGenerator()
	svc := section.NewService(repo, idGen)
	ctx := context.Background()

	// 1. Create builtin directly via DB
	builtinID := idGen.Generate()
	db.Exec("INSERT INTO section_definitions (id, name, is_builtin, schema_version, schema, created_at, updated_at, version) VALUES (?, 'Builtin1', 1, 1, '{}', ?, ?, 1)", builtinID, time.Now(), time.Now())

	// 2. Clone Builtin
	cloned, err := svc.CloneSectionDefinition(ctx, "comp-1", builtinID)
	if err != nil {
		t.Fatalf("failed to clone builtin: %v", err)
	}
	if cloned.Name != "Builtin1 (Clone)" {
		t.Fatalf("expected cloned name")
	}

	// 3. Create Custom
	custom, err := svc.CreateSectionDefinition(ctx, "comp-1", section.SectionCreateDTO{
		Name:   "Custom Section",
		Schema: `{"elements":[]}`,
	})
	if err != nil {
		t.Fatalf("failed to create custom: %v", err)
	}

	// 4. Update Custom
	updated, err := svc.UpdateSectionDefinition(ctx, "comp-1", section.SectionUpdateDTO{
		ID:     custom.ID,
		Name:   "Updated Custom",
		Schema: `{"elements":[]}`,
	})
	if err != nil || updated.Name != "Updated Custom" {
		t.Fatalf("failed to update custom")
	}

	// 5. Delete Builtin should fail
	err = svc.DeleteSectionDefinition(ctx, "comp-1", builtinID)
	if err != section.ErrCannotModifyBuiltin {
		t.Fatalf("expected ErrCannotModifyBuiltin, got: %v", err)
	}

	// 6. Delete Custom should succeed
	err = svc.DeleteSectionDefinition(ctx, "comp-1", custom.ID)
	if err != nil {
		t.Fatalf("failed to delete custom: %v", err)
	}

	// 7. List should have builtin and clone
	list, err := svc.ListSectionDefinitions(ctx, "comp-1")
	if err != nil || len(list) != 2 {
		t.Fatalf("expected 2 sections (builtin + cloned), got %d", len(list))
	}
}

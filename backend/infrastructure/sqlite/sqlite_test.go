package sqlite_test

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"quotierlabs/backend/domain"
	infra_sqlite "quotierlabs/backend/infrastructure/sqlite"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	sqlDB, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("failed to open sql db: %v", err)
	}

	// Use the same embedded migration pipeline as production.
	if err := infra_sqlite.RunMigrations(sqlDB); err != nil {
		t.Fatalf("goose up failed: %v", err)
	}

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open gorm db: %v", err)
	}

	conn, _ := db.DB()
	conn.SetMaxOpenConns(1)
	conn.Exec("PRAGMA foreign_keys = ON")

	return db
}

func TestCompanyRepository(t *testing.T) {
	db := setupTestDB(t)
	repo := infra_sqlite.NewCompanyRepository(db)
	ctx := context.Background()

	company := &domain.Company{
		ID:       "comp-1",
		Name:     "Test Company",
		Currency: "INR",
		IsActive: true,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
			Version:   1,
		},
	}

	err := repo.Create(ctx, company)
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	fetched, err := repo.GetActive(ctx)
	if err != nil {
		t.Fatalf("failed to get active company: %v", err)
	}
	if fetched.ID != "comp-1" {
		t.Errorf("expected comp-1, got %v", fetched.ID)
	}

	fetched.Name = "Updated Name"
	err = repo.Update(ctx, fetched)
	if err != nil {
		t.Fatalf("failed to update company: %v", err)
	}
	if fetched.Version != 2 {
		t.Errorf("expected version 2, got %v", fetched.Version)
	}
}

func TestCustomerRepository(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test', 'INR', ?, ?, 1)", time.Now(), time.Now())

	repo := infra_sqlite.NewCustomerRepository(db)
	ctx := context.Background()

	customer := &domain.Customer{
		ID:        "cust-1",
		CompanyID: "comp-1",
		Name:      "John Doe",
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
			Version:   1,
		},
	}

	if err := repo.Create(ctx, customer); err != nil {
		t.Fatalf("failed to create customer: %v", err)
	}

	customer.Name = "Jane Doe"
	if err := repo.Update(ctx, customer); err != nil {
		t.Fatalf("failed to update customer: %v", err)
	}

	fetched, err := repo.GetByID(ctx, "cust-1", "comp-1")
	if err != nil || fetched.Name != "Jane Doe" {
		t.Fatalf("get customer failed or mismatched: %v", err)
	}

	if _, err := repo.GetByID(ctx, "cust-1", "other-comp"); err == nil {
		t.Fatalf("should not find customer for other company")
	}

	if err := repo.Delete(ctx, "cust-1", "comp-1"); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	list, err := repo.List(ctx, "comp-1", domain.CustomerListFilter{})
	if err != nil {
		t.Fatalf("list failed: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("soft deleted customer should not be listed")
	}
}

func TestNumberSequenceRepository(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test', 'INR', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('seq-1', 'comp-1', 'quotation', 'QT-', '%04d', 0, 2026, ?, ?, 1)", time.Now(), time.Now())

	repo := infra_sqlite.NewNumberSequenceRepository(db)
	txManager := infra_sqlite.NewGormTxManager(db)
	ctx := context.Background()

	txCtx, err := txManager.BeginTx(ctx)
	if err != nil {
		t.Fatalf("failed to begin tx: %v", err)
	}

	nextVal, err := repo.ReserveNext(txCtx, "comp-1", "quotation", 2026)
	if err != nil {
		t.Fatalf("ReserveNext failed: %v", err)
	}
	if nextVal != 1 {
		t.Fatalf("expected next value 1, got %v", nextVal)
	}

	txManager.Commit(txCtx)

	seq, err := repo.GetCurrent(ctx, "comp-1", "quotation", 2026)
	if err != nil {
		t.Fatalf("GetCurrent failed: %v", err)
	}
	if seq.CurrentValue != 1 {
		t.Fatalf("expected current value 1, got %v", seq.CurrentValue)
	}
}

func TestTransactions(t *testing.T) {
	db := setupTestDB(t)
	companyRepo := infra_sqlite.NewCompanyRepository(db)
	txManager := infra_sqlite.NewGormTxManager(db)
	ctx := context.Background()

	txCtx, _ := txManager.BeginTx(ctx)
	companyRepo.Create(txCtx, &domain.Company{
		ID:       "comp-1",
		Name:     "Rollback Test",
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
			Version:   1,
		},
	})
	txManager.Rollback(txCtx)

	_, err := companyRepo.GetByID(ctx, "comp-1")
	if err == nil {
		t.Fatalf("expected record to not exist due to rollback")
	}
}

func TestSectionDefinitionRepository(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test', 'INR', ?, ?, 1)", time.Now(), time.Now())

	repo := infra_sqlite.NewSectionDefinitionRepository(db)
	ctx := context.Background()

	def := &domain.SectionDefinition{
		ID:            "sec-1",
		Name:          "Header",
		Schema:        "{}",
		SchemaVersion: 1,
		IsBuiltin:     true,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
			Version:   1,
		},
	}
	repo.Create(ctx, def)

	compDef := &domain.SectionDefinition{
		ID:            "sec-2",
		CompanyID:     func(s string) *string { return &s }("comp-1"),
		Name:          "Custom",
		Schema:        "{}",
		SchemaVersion: 1,
		IsBuiltin:     false,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
			Version:   1,
		},
	}
	repo.Create(ctx, compDef)

	builtins, _ := repo.ListBuiltins(ctx)
	if len(builtins) != 1 || builtins[0].ID != "sec-1" {
		t.Fatalf("expected 1 builtin section")
	}

	byComp, _ := repo.ListByCompany(ctx, "comp-1")
	if len(byComp) != 1 || byComp[0].ID != "sec-2" {
		t.Fatalf("expected 1 company section")
	}
}

func TestTemplateRepository(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test', 'INR', ?, ?, 1)", time.Now(), time.Now())

	repo := infra_sqlite.NewTemplateRepository(db)
	ctx := context.Background()

	tmpl := &domain.Template{
		ID:             "tmpl-1",
		CompanyID:      func(s string) *string { return &s }("comp-1"),
		Name:           "Default Template",
		Layout:         "{}",
		SchemaVersion:  1,
		CurrentVersion: 1,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
			Version:   1,
		},
	}
	repo.Create(ctx, tmpl)

	repo.CreateVersion(ctx, &domain.TemplateVersion{
		ID:            "tv-1",
		TemplateID:    "tmpl-1",
		Version:       1,
		Layout:        "{}",
		SchemaVersion: 1,
		CreatedAt:     time.Now(),
	})

	list, _ := repo.ListByCompany(ctx, "comp-1")
	if len(list) != 1 {
		t.Fatalf("expected 1 template")
	}

	repo.Delete(ctx, "tmpl-1", "comp-1")
	list2, _ := repo.ListByCompany(ctx, "comp-1")
	if len(list2) != 0 {
		t.Fatalf("expected 0 templates after delete")
	}
}

func TestQuotationRepository(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test', 'INR', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO customers (id, company_id, name, created_at, updated_at, version) VALUES ('cust-1', 'comp-1', 'John', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO templates (id, company_id, name, layout, schema_version, created_at, updated_at, version) VALUES ('tmpl-1', 'comp-1', 'Tmpl', '{}', 1, ?, ?, 1)", time.Now(), time.Now())

	repo := infra_sqlite.NewQuotationRepository(db)
	ctx := context.Background()

	q := &domain.Quotation{
		ID:            "q-1",
		CompanyID:     "comp-1",
		CustomerID:    "cust-1",
		TemplateID:    "tmpl-1",
		Number:        "QT-001",
		Status:        "DRAFT",
		Document:      "{}",
		SchemaVersion: 1,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
			Version:   1,
		},
	}
	err := repo.Create(ctx, q)
	if err != nil {
		t.Fatalf("failed to create quote: %v", err)
	}

	// Unique constraint test
	q2 := *q
	q2.ID = "q-2"
	err = repo.Create(ctx, &q2)
	if err == nil {
		t.Fatalf("expected unique constraint error for duplicate number")
	}

	list, _ := repo.List(ctx, "comp-1", domain.QuotationListFilter{})
	if len(list) != 1 {
		t.Fatalf("expected 1 quotation")
	}
}

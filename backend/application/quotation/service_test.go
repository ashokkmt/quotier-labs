package quotation_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/pressly/goose/v3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"quotierlabs/backend/application/quotation"
	domain_quotation "quotierlabs/backend/domain/quotation"
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
	conn.Exec("PRAGMA foreign_keys = ON")

	return db
}

func TestQuotationService(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test Comp', 'INR', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO customers (id, company_id, name, created_at, updated_at, version) VALUES ('cust-1', 'comp-1', 'Test Cust', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO customers (id, company_id, name, created_at, updated_at, version) VALUES ('cust-2', 'comp-1', 'Test Cust 2', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO templates (id, name, is_builtin, layout, schema_version, current_version, created_at, updated_at, version) VALUES ('tmpl-1', 'BuiltinTmpl', 1, '{\"rows\":[]}', 1, 1, ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('seq-1', 'comp-1', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", time.Now().UTC().Year(), time.Now(), time.Now())

	repo := infra_sqlite.NewQuotationRepository(db)
	templateRepo := infra_sqlite.NewTemplateRepository(db)
	customerRepo := infra_sqlite.NewCustomerRepository(db)
	companyRepo := infra_sqlite.NewCompanyRepository(db)
	seqRepo := infra_sqlite.NewNumberSequenceRepository(db)
	sectionRepo := infra_sqlite.NewSectionDefinitionRepository(db)
	resolver := domain_quotation.NewTemplateResolver(sectionRepo)
	txManager := infra_sqlite.NewGormTxManager(db)
	idGen := infra_id.NewULIDGenerator()

	svc := quotation.NewService(repo, templateRepo, customerRepo, companyRepo, seqRepo, resolver, txManager, idGen)
	ctx := context.Background()

	// 1. Create Draft
	q, err := svc.CreateQuotationDraft(ctx, "comp-1", quotation.QuotationCreateDTO{
		TemplateID: "tmpl-1",
		CustomerID: "cust-1",
	})
	if err != nil {
		t.Fatalf("failed to create draft: %v", err)
	}
	if q.Status != domain_quotation.StatusDraft {
		t.Fatalf("expected draft status")
	}
	if q.Number == "" {
		t.Fatalf("expected sequence number")
	}

	// 2. Update Document
	_, err = svc.UpdateQuotationDocument(ctx, "comp-1", quotation.QuotationUpdateDocumentDTO{
		ID:       q.ID,
		Document: `{"rows":[]}`,
	})
	if err != nil {
		t.Fatalf("failed to update doc: %v", err)
	}

	// 3. Update Customer
	updatedCust, err := svc.UpdateQuotationCustomer(ctx, "comp-1", quotation.QuotationUpdateCustomerDTO{
		ID:         q.ID,
		CustomerID: "cust-2",
	})
	if err != nil {
		t.Fatalf("failed to update customer: %v", err)
	}
	if updatedCust.CustomerID != "cust-2" {
		t.Fatalf("expected customer updated to cust-2")
	}
}

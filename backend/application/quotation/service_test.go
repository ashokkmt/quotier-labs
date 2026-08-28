package quotation_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"quotierlabs/backend/application/quotation"
	domain_quotation "quotierlabs/backend/domain/quotation"
	infra_id "quotierlabs/backend/infrastructure/id"
	infra_sqlite "quotierlabs/backend/infrastructure/sqlite"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared"
	sqlDB, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("failed to open sql db: %v", err)
	}

	if err := infra_sqlite.RunMigrations(sqlDB); err != nil {
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
	if q.Status != string(domain_quotation.StatusDraft) {
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

func TestCreateQuotationDraftFromScratch(t *testing.T) {
	db := setupTestDB(t)
	now := time.Now()
	db.Exec("INSERT INTO companies (id, name, currency, state, is_active, created_at, updated_at, version) VALUES ('scratch-comp', 'Scratch Co', 'INR', 'Maharashtra', 1, ?, ?, 1)", now, now)
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('scratch-seq', 'scratch-comp', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", now.Year(), now, now)
	dborm := db
	svc := quotation.NewService(
		infra_sqlite.NewQuotationRepository(dborm), infra_sqlite.NewTemplateRepository(dborm),
		infra_sqlite.NewCustomerRepository(dborm), infra_sqlite.NewCompanyRepository(dborm),
		infra_sqlite.NewNumberSequenceRepository(dborm), domain_quotation.NewTemplateResolver(infra_sqlite.NewSectionDefinitionRepository(dborm)),
		infra_sqlite.NewGormTxManager(dborm), infra_id.NewULIDGenerator(),
	)
	q, err := svc.CreateQuotationDraft(context.Background(), "scratch-comp", quotation.QuotationCreateDTO{})
	if err != nil {
		t.Fatalf("scratch draft failed: %v", err)
	}
	if q.TemplateID != "" || q.CustomerID != "" {
		t.Fatalf("scratch draft unexpectedly has dependencies: template=%q customer=%q", q.TemplateID, q.CustomerID)
	}
	if q.Document != `{"rows":[]}` {
		t.Fatalf("expected empty document, got %s", q.Document)
	}
}

func TestSaveQuotationAsTemplate(t *testing.T) {
	db := setupTestDB(t)
	now := time.Now()
	db.Exec("INSERT INTO companies (id, name, currency, state, is_active, created_at, updated_at, version) VALUES ('template-comp', 'Template Co', 'INR', 'Maharashtra', 1, ?, ?, 1)", now, now)
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('template-seq', 'template-comp', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", now.Year(), now, now)
	db.Exec("INSERT INTO section_definitions (id, name, schema, schema_version, is_builtin, created_at, updated_at, version) VALUES ('def-1', 'Notes', '{\"elements\":[]}', 1, 1, ?, ?, 1)", now, now)
	repo := infra_sqlite.NewQuotationRepository(db)
	templateRepo := infra_sqlite.NewTemplateRepository(db)
	svc := quotation.NewService(repo, templateRepo, infra_sqlite.NewCustomerRepository(db), infra_sqlite.NewCompanyRepository(db), infra_sqlite.NewNumberSequenceRepository(db), domain_quotation.NewTemplateResolver(infra_sqlite.NewSectionDefinitionRepository(db)), infra_sqlite.NewGormTxManager(db), infra_id.NewULIDGenerator())
	q, err := svc.CreateQuotationDraft(context.Background(), "template-comp", quotation.QuotationCreateDTO{})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.UpdateQuotationDocument(context.Background(), "template-comp", quotation.QuotationUpdateDocumentDTO{ID: q.ID, Document: `{"rows":[{"id":"r1","columns":[{"id":"c1","width":"100%","sections":[{"id":"s1","section_definition_id":"def-1","visibility":true,"optional":false}]}]}]}`})
	if err != nil {
		t.Fatal(err)
	}
	tmpl, err := svc.SaveAsTemplate(context.Background(), "template-comp", quotation.SaveAsTemplateDTO{QuotationID: q.ID, Name: "Reusable Quote"})
	if err != nil {
		t.Fatal(err)
	}
	if tmpl.Name != "Reusable Quote" || tmpl.ID == "" {
		t.Fatalf("unexpected template: %+v", tmpl)
	}
	if _, err := templateRepo.GetByID(context.Background(), tmpl.ID); err != nil {
		t.Fatalf("template was not persisted: %v", err)
	}
}

func TestRecalculateQuotation(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, state, created_at, updated_at, version) VALUES ('comp-2', 'Test Comp', 'INR', 'Maharashtra', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO customers (id, company_id, name, state, created_at, updated_at, version) VALUES ('cust-3', 'comp-2', 'Test Cust', 'Maharashtra', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO templates (id, name, is_builtin, layout, schema_version, current_version, created_at, updated_at, version) VALUES ('tmpl-2', 'BuiltinTmpl', 1, '{\"rows\":[]}', 1, 1, ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('seq-2', 'comp-2', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", time.Now().UTC().Year(), time.Now(), time.Now())

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
	q, err := svc.CreateQuotationDraft(ctx, "comp-2", quotation.QuotationCreateDTO{
		TemplateID: "tmpl-2",
		CustomerID: "cust-3",
	})
	if err != nil {
		t.Fatalf("failed to create draft: %v", err)
	}

	// 2. Inject Document with a table having totals
	docJSON := `{"rows":[{"id":"r1","columns":[{"id":"c1","sections":[{"id":"s1","tables":[{"id":"tbl-1","has_totals":true,"totals_config":{"qty_col":"qty","rate_col":"rate","tax_rate_col":"tax"},"rows":[{"qty":2,"rate":5000,"tax":18.0}]}]}]}]}]}`
	_, err = svc.UpdateQuotationDocument(ctx, "comp-2", quotation.QuotationUpdateDocumentDTO{
		ID:       q.ID,
		Document: docJSON,
	})
	if err != nil {
		t.Fatalf("failed to update doc: %v", err)
	}

	// 3. Recalculate
	res, err := svc.RecalculateQuotation(ctx, "comp-2", q.ID)
	if err != nil {
		t.Fatalf("failed to recalculate: %v", err)
	}

	if res.TaxMode != "INTRA_STATE" {
		t.Errorf("expected INTRA_STATE, got %v", res.TaxMode)
	}
	if res.Subtotal != 10000 {
		t.Errorf("expected subtotal 10000, got %v", res.Subtotal)
	}
	if res.CGSTTotal != 900 {
		t.Errorf("expected cgst 900, got %v", res.CGSTTotal)
	}
}

func TestFinalizeAndStatusTransitions(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, state, created_at, updated_at, version) VALUES ('comp-3', 'Test Comp', 'INR', 'Maharashtra', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO customers (id, company_id, name, state, created_at, updated_at, version) VALUES ('cust-4', 'comp-3', 'Test Cust', 'Maharashtra', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO templates (id, name, is_builtin, layout, schema_version, current_version, created_at, updated_at, version) VALUES ('tmpl-3', 'BuiltinTmpl', 1, '{\"rows\":[]}', 1, 1, ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('seq-3', 'comp-3', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", time.Now().UTC().Year(), time.Now(), time.Now())

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
	q, err := svc.CreateQuotationDraft(ctx, "comp-3", quotation.QuotationCreateDTO{
		TemplateID: "tmpl-3",
		CustomerID: "cust-4",
	})
	if err != nil {
		t.Fatalf("failed to create draft: %v", err)
	}

	// 2. Finalize
	qFin, err := svc.FinalizeQuotation(ctx, "comp-3", q.ID)
	if err != nil {
		t.Fatalf("failed to finalize: %v", err)
	}
	if qFin.Status != "FINALIZED" {
		t.Errorf("expected FINALIZED, got %s", qFin.Status)
	}

	qDom, _ := repo.GetByID(ctx, q.ID, "comp-3")
	if qDom.CompanySnapshot == nil || qDom.CustomerSnapshot == nil || qDom.TemplateSnapshot == nil {
		t.Errorf("snapshots were not created")
	}

	// 3. Invalid Transition
	_, err = svc.UpdateQuotationStatus(ctx, "comp-3", q.ID, "DRAFT")
	if err == nil {
		t.Errorf("expected error when transitioning FINALIZED to DRAFT")
	}

	// 4. Valid Transition to SENT
	qSent, err := svc.UpdateQuotationStatus(ctx, "comp-3", q.ID, "SENT")
	if err != nil {
		t.Fatalf("failed to transition to SENT: %v", err)
	}
	if qSent.Status != "SENT" {
		t.Errorf("expected SENT, got %s", qSent.Status)
	}

	// 5. Duplicate
	qDup, err := svc.DuplicateQuotation(ctx, "comp-3", q.ID)
	if err != nil {
		t.Fatalf("failed to duplicate: %v", err)
	}
	if qDup.Status != "DRAFT" {
		t.Errorf("expected duplicated quotation to be DRAFT, got %s", qDup.Status)
	}
	if qDup.ID == q.ID {
		t.Errorf("duplicate has same ID as original")
	}
}

package quotation_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"quotierlabs/backend/application/quotation"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/documentv6"
	domain_quotation "quotierlabs/backend/domain/quotation"
	infra_id "quotierlabs/backend/infrastructure/id"
	infra_sqlite "quotierlabs/backend/infrastructure/sqlite"
)

type conflictOnceQuotationRepository struct {
	domain.QuotationRepository
	inner    domain.QuotationRepository
	conflict bool
}

func (r *conflictOnceQuotationRepository) Update(ctx context.Context, quotation *domain.Quotation) error {
	if !r.conflict {
		r.conflict = true
		current, err := r.inner.GetByID(ctx, quotation.ID, quotation.CompanyID)
		if err != nil {
			return err
		}
		note := "concurrent update"
		current.Notes = &note
		if err := r.inner.Update(ctx, current); err != nil {
			return err
		}
	}
	return r.inner.Update(ctx, quotation)
}

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

func blankDocument(t *testing.T, pageID string) string {
	t.Helper()
	raw, err := json.Marshal(documentmodel.NewBlank(pageID))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestQuotationService(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test Comp', 'INR', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO customers (id, company_id, name, created_at, updated_at, version) VALUES ('cust-1', 'comp-1', 'Test Cust', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO customers (id, company_id, name, created_at, updated_at, version) VALUES ('cust-2', 'comp-1', 'Test Cust 2', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO templates (id, name, is_builtin, layout, schema_version, current_version, created_at, updated_at, version) VALUES ('tmpl-1', 'BuiltinTmpl', 1, ?, 5, 1, ?, ?, 1)", blankDocument(t, "tmpl-page-1"), time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('seq-1', 'comp-1', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", time.Now().UTC().Year(), time.Now(), time.Now())

	repo := infra_sqlite.NewQuotationRepository(db)
	templateRepo := infra_sqlite.NewTemplateRepository(db)
	customerRepo := infra_sqlite.NewCustomerRepository(db)
	companyRepo := infra_sqlite.NewCompanyRepository(db)
	seqRepo := infra_sqlite.NewNumberSequenceRepository(db)
	txManager := infra_sqlite.NewGormTxManager(db)
	idGen := infra_id.NewULIDGenerator()

	svc := quotation.NewService(repo, templateRepo, customerRepo, companyRepo, seqRepo, txManager, idGen, nil)
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
	if parsed, err := documentmodel.Parse([]byte(q.Document)); err != nil || parsed.SchemaVersion != documentmodel.SchemaVersion {
		t.Fatalf("V5 template was not copied into the draft: %v (%s)", err, q.Document)
	}

	// 2. Update Document
	_, err = svc.UpdateQuotationDocument(ctx, "comp-1", quotation.QuotationUpdateDocumentDTO{
		ID:       q.ID,
		Document: blankDocument(t, "updated-page-1"),
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

	// 4. Optional expected total is independent of the document and customer.
	expectedTotal := int64(125050)
	updatedAmount, err := svc.UpdateQuotationExpectedTotal(ctx, "comp-1", quotation.QuotationUpdateExpectedTotalDTO{
		ID: q.ID, ExpectedTotal: &expectedTotal,
	})
	if err != nil || updatedAmount.ExpectedTotal == nil || *updatedAmount.ExpectedTotal != expectedTotal {
		t.Fatalf("failed to update expected total: %+v err=%v", updatedAmount, err)
	}
	reloaded, err := svc.GetQuotation(ctx, "comp-1", q.ID)
	if err != nil || reloaded.ExpectedTotal == nil || *reloaded.ExpectedTotal != expectedTotal {
		t.Fatalf("expected total was not persisted: %+v err=%v", reloaded, err)
	}
	minAmount, maxAmount := int64(125000), int64(126000)
	listed, err := svc.ListQuotations(ctx, "comp-1", quotation.QuotationListFilterDTO{MinAmount: &minAmount, MaxAmount: &maxAmount})
	if err != nil || listed.Total != 1 || listed.Items[0].ExpectedTotal == nil || *listed.Items[0].ExpectedTotal != expectedTotal {
		t.Fatalf("amount range did not return expected quotation: %+v err=%v", listed, err)
	}
	tooHigh := int64(126001)
	listed, err = svc.ListQuotations(ctx, "comp-1", quotation.QuotationListFilterDTO{MinAmount: &tooHigh})
	if err != nil || listed.Total != 0 {
		t.Fatalf("amount range included out-of-range quotation: %+v err=%v", listed, err)
	}
	if _, err := svc.UpdateQuotationExpectedTotal(ctx, "comp-1", quotation.QuotationUpdateExpectedTotalDTO{ID: q.ID, ExpectedTotal: func() *int64 { value := int64(-1); return &value }()}); err == nil {
		t.Fatal("negative expected total should be rejected")
	}
	cleared, err := svc.UpdateQuotationExpectedTotal(ctx, "comp-1", quotation.QuotationUpdateExpectedTotalDTO{ID: q.ID})
	if err != nil || cleared.ExpectedTotal != nil {
		t.Fatalf("expected total was not cleared: %+v err=%v", cleared, err)
	}
	reloaded, err = svc.GetQuotation(ctx, "comp-1", q.ID)
	if err != nil || reloaded.ExpectedTotal != nil {
		t.Fatalf("cleared expected total remained in persistence: %+v err=%v", reloaded, err)
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
		infra_sqlite.NewNumberSequenceRepository(dborm),
		infra_sqlite.NewGormTxManager(dborm), infra_id.NewULIDGenerator(), nil,
	)
	q, err := svc.CreateQuotationDraft(context.Background(), "scratch-comp", quotation.QuotationCreateDTO{})
	if err != nil {
		t.Fatalf("scratch draft failed: %v", err)
	}
	if q.TemplateID != "" || q.CustomerID != "" {
		t.Fatalf("scratch draft unexpectedly has dependencies: template=%q customer=%q", q.TemplateID, q.CustomerID)
	}
	document, err := documentmodel.Parse([]byte(q.Document))
	if err != nil || document.SchemaVersion != documentmodel.SchemaVersion || len(document.Root.Pages) != 1 || len(document.Root.Pages[0].Children) != 0 {
		t.Fatalf("expected empty V5 A4 document, got %s (err=%v)", q.Document, err)
	}
}

func TestUpdateQuotationDocumentRetriesOneOptimisticConflict(t *testing.T) {
	db := setupTestDB(t)
	now := time.Now()
	db.Exec("INSERT INTO companies (id, name, currency, state, is_active, created_at, updated_at, version) VALUES ('retry-comp', 'Retry Co', 'INR', 'Maharashtra', 1, ?, ?, 1)", now, now)
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('retry-seq', 'retry-comp', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", now.Year(), now, now)
	inner := infra_sqlite.NewQuotationRepository(db)
	repo := &conflictOnceQuotationRepository{QuotationRepository: inner, inner: inner}
	svc := quotation.NewService(repo, infra_sqlite.NewTemplateRepository(db), infra_sqlite.NewCustomerRepository(db), infra_sqlite.NewCompanyRepository(db), infra_sqlite.NewNumberSequenceRepository(db), infra_sqlite.NewGormTxManager(db), infra_id.NewULIDGenerator(), nil)
	ctx := context.Background()
	created, err := svc.CreateQuotationDraft(ctx, "retry-comp", quotation.QuotationCreateDTO{UseV6: true})
	if err != nil {
		t.Fatal(err)
	}
	updated, err := svc.UpdateQuotationDocument(ctx, "retry-comp", quotation.QuotationUpdateDocumentDTO{ID: created.ID, Document: created.Document})
	if err != nil || !repo.conflict || updated.ID != created.ID {
		t.Fatalf("save did not recover from one optimistic conflict: updated=%+v conflict=%v err=%v", updated, repo.conflict, err)
	}
}

func TestSaveQuotationAsTemplate(t *testing.T) {
	db := setupTestDB(t)
	now := time.Now()
	db.Exec("INSERT INTO companies (id, name, currency, state, is_active, created_at, updated_at, version) VALUES ('template-comp', 'Template Co', 'INR', 'Maharashtra', 1, ?, ?, 1)", now, now)
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('template-seq', 'template-comp', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", now.Year(), now, now)
	repo := infra_sqlite.NewQuotationRepository(db)
	templateRepo := infra_sqlite.NewTemplateRepository(db)
	svc := quotation.NewService(repo, templateRepo, infra_sqlite.NewCustomerRepository(db), infra_sqlite.NewCompanyRepository(db), infra_sqlite.NewNumberSequenceRepository(db), infra_sqlite.NewGormTxManager(db), infra_id.NewULIDGenerator(), nil)
	q, err := svc.CreateQuotationDraft(context.Background(), "template-comp", quotation.QuotationCreateDTO{})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.UpdateQuotationDocument(context.Background(), "template-comp", quotation.QuotationUpdateDocumentDTO{ID: q.ID, Document: blankDocument(t, "saved-template-page")})
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
	db.Exec("INSERT INTO templates (id, name, is_builtin, layout, schema_version, current_version, created_at, updated_at, version) VALUES ('tmpl-2', 'BuiltinTmpl', 1, ?, 5, 1, ?, ?, 1)", blankDocument(t, "tmpl-page-2"), time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('seq-2', 'comp-2', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", time.Now().UTC().Year(), time.Now(), time.Now())

	repo := infra_sqlite.NewQuotationRepository(db)
	templateRepo := infra_sqlite.NewTemplateRepository(db)
	customerRepo := infra_sqlite.NewCustomerRepository(db)
	companyRepo := infra_sqlite.NewCompanyRepository(db)
	seqRepo := infra_sqlite.NewNumberSequenceRepository(db)
	txManager := infra_sqlite.NewGormTxManager(db)
	idGen := infra_id.NewULIDGenerator()

	svc := quotation.NewService(repo, templateRepo, customerRepo, companyRepo, seqRepo, txManager, idGen, nil)
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
	docJSON := `{"schema_version":5,"root":{"pages":[{"id":"page-2","width":59528,"height":84189,"margin":{"top":0,"right":0,"bottom":0,"left":0},"child_ids":[],"children":[]}]},"stories":[{"id":"items","kind":"table","content":{"headers":["Item"],"rows":[["Service"]],"column_count":1,"line_items":[{"id":"line-1","quantity":2,"rate":5000,"discount":0,"tax_rate":18,"tax_inclusive":false}]}}],"settings":{"page_size":"A4","orientation":"portrait"}}`
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
	if len(res.LineItems) != 1 || res.LineItems[0].ID != "line-1" || res.LineItems[0].GrandTotal != 11800 {
		t.Errorf("expected authoritative line result, got %+v", res.LineItems)
	}
}

func TestV6SaveRecalculatesAuthoritativeTotals(t *testing.T) {
	db := setupTestDB(t)
	now := time.Now()
	db.Exec("INSERT INTO companies (id, name, currency, state, created_at, updated_at, version) VALUES ('v6-comp', 'V6 Comp', 'INR', 'Maharashtra', ?, ?, 1)", now, now)
	db.Exec("INSERT INTO customers (id, company_id, name, state, created_at, updated_at, version) VALUES ('v6-customer', 'v6-comp', 'V6 Customer', 'Maharashtra', ?, ?, 1)", now, now)
	db.Exec("INSERT INTO customers (id, company_id, name, state, created_at, updated_at, version) VALUES ('v6-interstate', 'v6-comp', 'Interstate Customer', 'Gujarat', ?, ?, 1)", now, now)
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('v6-seq', 'v6-comp', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", now.Year(), now, now)
	svc := quotation.NewService(infra_sqlite.NewQuotationRepository(db), infra_sqlite.NewTemplateRepository(db), infra_sqlite.NewCustomerRepository(db), infra_sqlite.NewCompanyRepository(db), infra_sqlite.NewNumberSequenceRepository(db), infra_sqlite.NewGormTxManager(db), infra_id.NewULIDGenerator(), nil)
	draft, err := svc.CreateQuotationDraft(context.Background(), "v6-comp", quotation.QuotationCreateDTO{CustomerID: "v6-customer", UseV6: true})
	if err != nil {
		t.Fatal(err)
	}
	doc := documentv6.NewBlank("p")
	doc.Body.Content = append(doc.Body.Content, documentv6.Node{Type: "lineItemTable", Attrs: mustAttrs(documentv6.LineItemTableAttrs{ID: "items", Rows: []documentv6.LineItem{{ID: "line", Description: "Service", Quantity: 2, Rate: 10000, Discount: 1000, TaxRate: 18}}})})
	raw, _ := json.Marshal(doc)
	saved, err := svc.UpdateQuotationDocument(context.Background(), "v6-comp", quotation.QuotationUpdateDocumentDTO{ID: draft.ID, Document: string(raw)})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Subtotal != 20000 || saved.DiscountTotal != 1000 || saved.CGSTTotal != 1710 || saved.SGSTTotal != 1710 || saved.GrandTotal != 22400 {
		t.Fatalf("save persisted non-authoritative totals: %+v", saved)
	}
	interstate, err := svc.UpdateQuotationCustomer(context.Background(), "v6-comp", quotation.QuotationUpdateCustomerDTO{ID: draft.ID, CustomerID: "v6-interstate"})
	if err != nil {
		t.Fatal(err)
	}
	if interstate.CGSTTotal != 0 || interstate.SGSTTotal != 0 || interstate.IGSTTotal != 3420 || interstate.GrandTotal != 22400 {
		t.Fatalf("customer change did not recalculate the tax mode: %+v", interstate)
	}
}

func mustAttrs(value any) json.RawMessage { raw, _ := json.Marshal(value); return raw }

func TestFinalizeAndStatusTransitions(t *testing.T) {
	db := setupTestDB(t)
	db.Exec("INSERT INTO companies (id, name, currency, state, created_at, updated_at, version) VALUES ('comp-3', 'Test Comp', 'INR', 'Maharashtra', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO customers (id, company_id, name, state, created_at, updated_at, version) VALUES ('cust-4', 'comp-3', 'Test Cust', 'Maharashtra', ?, ?, 1)", time.Now(), time.Now())
	db.Exec("INSERT INTO templates (id, name, is_builtin, layout, schema_version, current_version, created_at, updated_at, version) VALUES ('tmpl-3', 'BuiltinTmpl', 1, ?, 5, 1, ?, ?, 1)", blankDocument(t, "tmpl-page-3"), time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('seq-3', 'comp-3', 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", time.Now().UTC().Year(), time.Now(), time.Now())

	repo := infra_sqlite.NewQuotationRepository(db)
	templateRepo := infra_sqlite.NewTemplateRepository(db)
	customerRepo := infra_sqlite.NewCustomerRepository(db)
	companyRepo := infra_sqlite.NewCompanyRepository(db)
	seqRepo := infra_sqlite.NewNumberSequenceRepository(db)
	txManager := infra_sqlite.NewGormTxManager(db)
	idGen := infra_id.NewULIDGenerator()
	svc := quotation.NewService(repo, templateRepo, customerRepo, companyRepo, seqRepo, txManager, idGen, nil)
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

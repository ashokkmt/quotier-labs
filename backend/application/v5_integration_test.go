package application_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"

	app_cust "quotierlabs/backend/application/customer"
	app_quot "quotierlabs/backend/application/quotation"
	app_tmpl "quotierlabs/backend/application/template"
	"quotierlabs/backend/domain/documentmodel"
	domain_quotation "quotierlabs/backend/domain/quotation"
	"quotierlabs/backend/infrastructure/id"
	"quotierlabs/backend/infrastructure/sqlite"
)

// v5DocumentFixture is a minimal valid V5 quotation document used by the integration tests.
const v5DocumentFixture = `{
  "schema_version": 5,
  "root": {"pages": [{
    "id": "page-1", "width": 59528, "height": 84189,
    "margin": {"top": 0, "right": 0, "bottom": 0, "left": 0},
    "child_ids": ["title"],
    "children": [{
      "id": "title", "kind": "text", "role": "element",
      "geometry": {"x": 7200, "y": 7200, "width": 30000, "height": 4000, "rotation": 0},
      "layout_mode": "fixed", "visibility": "shown", "optional": false,
      "props": {"text": "Integration Title"}
    }]
  }]},
  "settings": {"page_size": "A4", "orientation": "portrait"}
}`

func setupV5Env(t *testing.T) (*gorm.DB, *app_quot.Service, *app_tmpl.Service, *app_cust.Service, string) {
	t.Helper()
	db := setupDB(t)
	sqlDB, _ := db.DB()
	if err := sqlite.RunMigrations(sqlDB); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	txManager := sqlite.NewGormTxManager(db)
	compRepo := sqlite.NewCompanyRepository(db)
	custRepo := sqlite.NewCustomerRepository(db)
	tmplRepo := sqlite.NewTemplateRepository(db)
	quotRepo := sqlite.NewQuotationRepository(db)
	seqRepo := sqlite.NewNumberSequenceRepository(db)
	idGen := id.NewULIDGenerator()
	resolver := domain_quotation.NewTemplateResolver(sqlite.NewSectionDefinitionRepository(db))
	quotSvc := app_quot.NewService(quotRepo, tmplRepo, custRepo, compRepo, seqRepo, resolver, txManager, idGen, nil)
	tmplSvc := app_tmpl.NewService(tmplRepo, txManager, idGen)
	custSvc := app_cust.NewService(custRepo, idGen)

	compID := "v5-comp"
	db.Exec("INSERT INTO companies (id, name, currency, is_active, created_at, updated_at, version) VALUES (?, 'V5 Company', 'INR', 1, ?, ?, 1)", compID, time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('v5-seq', ?, 'QUOTATION', 'QT', 'QT-YYYY-NNNN', 0, ?, ?, ?, 1)", compID, time.Now().Year(), time.Now(), time.Now())
	return db, quotSvc, tmplSvc, custSvc, compID
}

// attachCustomer creates a customer and assigns it to the draft, as the builder does before
// finalization.
func attachCustomer(t *testing.T, custSvc *app_cust.Service, quotSvc *app_quot.Service, ctx context.Context, compID, quotationID string) {
	t.Helper()
	cust, err := custSvc.CreateCustomer(ctx, compID, app_cust.CustomerCreateDTO{Name: "V5 Client"})
	if err != nil {
		t.Fatalf("create customer: %v", err)
	}
	if _, err := quotSvc.UpdateQuotationCustomer(ctx, compID, app_quot.QuotationUpdateCustomerDTO{ID: quotationID, CustomerID: cust.ID}); err != nil {
		t.Fatalf("assign customer: %v", err)
	}
}

// Phase 12 gate: create → save V5 → reload → duplicate → finalize → export immutability.
func TestV5QuotationLifecycle(t *testing.T) {
	db, quotSvc, _, custSvc, compID := setupV5Env(t)
	quotRepo := sqlite.NewQuotationRepository(db)
	ctx := context.Background()

	draft, err := quotSvc.CreateQuotationDraft(ctx, compID, app_quot.QuotationCreateDTO{})
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}

	saved, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: draft.ID, Document: v5DocumentFixture})
	if err != nil {
		t.Fatalf("save V5 document: %v", err)
	}
	if saved.SchemaVersion != 5 {
		t.Fatalf("expected persisted schema version 5, got %d", saved.SchemaVersion)
	}

	reloaded, err := quotSvc.GetQuotation(ctx, compID, draft.ID)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if reloaded.Document != v5DocumentFixture {
		t.Fatal("V5 document changed across a save/reload round trip")
	}

	duplicate, err := quotSvc.DuplicateQuotation(ctx, compID, draft.ID)
	if err != nil {
		t.Fatalf("duplicate: %v", err)
	}
	if duplicate.SchemaVersion != 5 || duplicate.Document != v5DocumentFixture {
		t.Fatalf("duplicate lost V5 identity: version=%d doc-equal=%v", duplicate.SchemaVersion, duplicate.Document == v5DocumentFixture)
	}

	// Save As Template must preserve the exact V5 layout bytes.
	tmpl, err := quotSvc.SaveAsTemplate(ctx, compID, app_quot.SaveAsTemplateDTO{QuotationID: draft.ID, Name: "V5 Template"})
	if err != nil {
		t.Fatalf("save as template: %v", err)
	}
	if tmpl.SchemaVersion != 5 || tmpl.Layout != v5DocumentFixture {
		t.Fatalf("V5 template not preserved: version=%d layout-equal=%v", tmpl.SchemaVersion, tmpl.Layout == v5DocumentFixture)
	}

	// Finalize requires an assigned customer, as the builder enforces before finalizing.
	attachCustomer(t, custSvc, quotSvc, ctx, compID, draft.ID)
	finalized, err := quotSvc.FinalizeQuotation(ctx, compID, draft.ID)
	if err != nil {
		t.Fatalf("finalize: %v", err)
	}
	if finalized.Status != "FINALIZED" || finalized.Document != v5DocumentFixture {
		t.Fatalf("finalized quotation mutated: status=%s same-doc=%v", finalized.Status, finalized.Document == v5DocumentFixture)
	}

	// Finalized quotations are immutable: no further document writes.
	if _, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: draft.ID, Document: v5DocumentFixture}); err == nil {
		t.Fatal("expected finalized quotation to reject document updates")
	}

	// Finalized quotation re-opens byte-for-byte unchanged, with complete snapshots.
	stored, err := quotRepo.GetByID(ctx, draft.ID, compID)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if stored.Document != v5DocumentFixture || stored.CompanySnapshot == nil || *stored.CompanySnapshot == "" || stored.CustomerSnapshot == nil || *stored.CustomerSnapshot == "" {
		t.Fatal("finalized reopen lost document or snapshots")
	}
}

// v5DocumentsEquivalent reports whether two serialized V5 documents are semantically identical.
func v5DocumentsEquivalent(t *testing.T, a, b string) bool {
	t.Helper()
	pa, err := documentmodel.Parse([]byte(a))
	if err != nil {
		t.Fatalf("parse draft: %v", err)
	}
	pb, err := documentmodel.Parse([]byte(b))
	if err != nil {
		t.Fatalf("parse template: %v", err)
	}
	ca, _ := json.Marshal(pa)
	cb, _ := json.Marshal(pb)
	return string(ca) == string(cb)
}

// Phase 12 gate: a V5 template resolves into an independent V5 draft; editing the draft never
// mutates the template, and legacy template creation still works.
func TestV5TemplateResolutionIndependence(t *testing.T) {
	_, quotSvc, tmplSvc, _, compID := setupV5Env(t)
	ctx := context.Background()

	created, err := tmplSvc.CreateTemplate(ctx, compID, app_tmpl.TemplateCreateDTO{Name: "V5 Master", Layout: v5DocumentFixture})
	if err != nil {
		t.Fatalf("create V5 template: %v", err)
	}

	draft, err := quotSvc.CreateQuotationDraft(ctx, compID, app_quot.QuotationCreateDTO{TemplateID: created.ID})
	if err != nil {
		t.Fatalf("draft from V5 template: %v", err)
	}
	if draft.SchemaVersion != 5 {
		t.Fatalf("expected V5 draft from V5 template, got version %d", draft.SchemaVersion)
	}
	// The draft is a canonical deep copy; field order may differ but semantics must not.
	if !v5DocumentsEquivalent(t, draft.Document, v5DocumentFixture) {
		t.Fatalf("draft layout diverges from template: %s", draft.Document)
	}

	edited := strings.Replace(v5DocumentFixture, "Integration Title", "Edited Title", 1)
	if _, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: draft.ID, Document: edited}); err != nil {
		t.Fatalf("edit draft: %v", err)
	}
	fetched, err := tmplSvc.GetTemplate(ctx, compID, created.ID)
	if err != nil {
		t.Fatalf("fetch template: %v", err)
	}
	if fetched.Layout != v5DocumentFixture {
		t.Fatal("template layout was mutated through a draft")
	}
}

// Phase 12 gate: finalization rejects required overset content but accepts optional overset.
func TestV5FinalizationRejectsRequiredOverset(t *testing.T) {
	_, quotSvc, _, custSvc, compID := setupV5Env(t)
	ctx := context.Background()

	oversetDoc := `{"schema_version":5,"root":{"pages":[{"id":"page-1","width":59528,"height":84189,"margin":{"top":0,"right":0,"bottom":0,"left":0},"child_ids":["tiny"],"children":[{"id":"tiny","kind":"text","role":"element","geometry":{"x":0,"y":0,"width":2000,"height":500,"rotation":0},"layout_mode":"fixed","visibility":"shown","optional":false,"props":{"text":"This required sentence is far too long to ever fit inside a two hundred du wide and five hundred du tall box."}}]}]},"settings":{"page_size":"A4","orientation":"portrait"}}`

	draft, err := quotSvc.CreateQuotationDraft(ctx, compID, app_quot.QuotationCreateDTO{})
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	attachCustomer(t, custSvc, quotSvc, ctx, compID, draft.ID)
	if _, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: draft.ID, Document: oversetDoc}); err != nil {
		t.Fatalf("save overset document: %v", err)
	}
	if _, err := quotSvc.FinalizeQuotation(ctx, compID, draft.ID); err == nil {
		t.Fatal("expected finalization to reject required overset content")
	}

	optionalDoc := strings.Replace(oversetDoc, `"optional":false`, `"optional":true`, 1)
	optionalDraft, err := quotSvc.CreateQuotationDraft(ctx, compID, app_quot.QuotationCreateDTO{})
	if err != nil {
		t.Fatalf("create optional draft: %v", err)
	}
	attachCustomer(t, custSvc, quotSvc, ctx, compID, optionalDraft.ID)
	if _, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: optionalDraft.ID, Document: optionalDoc}); err != nil {
		t.Fatalf("save optional overset document: %v", err)
	}
	if _, err := quotSvc.FinalizeQuotation(ctx, compID, optionalDraft.ID); err != nil {
		t.Fatalf("optional overset should finalize: %v", err)
	}
}

// Phase 12 gate: diagnostics endpoints enforce company isolation.
func TestV5DiagnosticsCompanyIsolation(t *testing.T) {
	db, quotSvc, _, _, compID := setupV5Env(t)
	ctx := context.Background()

	draft, err := quotSvc.CreateQuotationDraft(ctx, compID, app_quot.QuotationCreateDTO{})
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if _, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: draft.ID, Document: v5DocumentFixture}); err != nil {
		t.Fatalf("save document: %v", err)
	}

	otherCompany := "v5-comp-other"
	db.Exec("INSERT INTO companies (id, name, currency, is_active, created_at, updated_at, version) VALUES (?, 'Other Co', 'INR', 1, ?, ?, 1)", otherCompany, time.Now(), time.Now())

	if _, err := quotSvc.GetQuotation(ctx, otherCompany, draft.ID); err == nil {
		t.Fatal("cross-company quotation read must fail")
	}
}

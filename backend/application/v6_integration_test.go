package application_test

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	app_document "quotierlabs/backend/application/document"
	"quotierlabs/backend/application/flowlayout"
	app_quot "quotierlabs/backend/application/quotation"
	app_tmpl "quotierlabs/backend/application/template"
	"quotierlabs/backend/domain/documentv6"
	"quotierlabs/backend/infrastructure/pdf"
	"quotierlabs/backend/infrastructure/sqlite"
)

func v6Fixture(t *testing.T) string {
	t.Helper()
	doc := documentv6.NewBlank("v6-title")
	style, _ := json.Marshal(documentv6.TextStyleAttrs{FontFamily: "Quotier Sans", FontSize: 1400, Color: "#1F2937"})
	doc.Body.Content[0].Content = []documentv6.Node{
		{Type: "text", Text: "A ", Marks: []documentv6.Mark{}},
		{Type: "text", Text: "useful", Marks: []documentv6.Mark{{Type: "bold"}, {Type: "underline"}, {Type: "textStyle", Attrs: style}}},
		{Type: "text", Text: " quotation", Marks: []documentv6.Mark{}},
	}
	items, _ := json.Marshal(documentv6.LineItemTableAttrs{ID: "items", Rows: []documentv6.LineItem{{ID: "item-1", Description: "Design", Quantity: 2, Rate: 5000, TaxRate: 18}}})
	doc.Body.Content = append(doc.Body.Content, documentv6.Node{Type: "lineItemTable", Attrs: items})
	raw, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestV6QuotationLifecycleAndCalculation(t *testing.T) {
	db, quotSvc, _, custSvc, compID := setupV5Env(t)
	ctx := context.Background()
	draft, err := quotSvc.CreateQuotationDraft(ctx, compID, app_quot.QuotationCreateDTO{UseV6: true})
	if err != nil {
		t.Fatal(err)
	}
	if draft.SchemaVersion != 6 {
		t.Fatalf("new V6 draft version=%d", draft.SchemaVersion)
	}
	document := v6Fixture(t)
	saved, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: draft.ID, Document: document})
	if err != nil {
		t.Fatal(err)
	}
	if saved.SchemaVersion != 6 {
		t.Fatalf("saved version=%d", saved.SchemaVersion)
	}
	result, err := quotSvc.RecalculateQuotation(ctx, compID, draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	if result.Subtotal != 10000 || result.GrandTotal != 11800 {
		t.Fatalf("unexpected calculation: %+v", result)
	}
	attachCustomer(t, custSvc, quotSvc, ctx, compID, draft.ID)
	finalized, err := quotSvc.FinalizeQuotation(ctx, compID, draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	if finalized.Status != "FINALIZED" || finalized.Document != document || finalized.GrandTotal != 11800 {
		t.Fatalf("unexpected finalization: %+v", finalized)
	}
	if _, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: draft.ID, Document: document}); err == nil {
		t.Fatal("finalized V6 document was mutable")
	}
	stored, err := sqlite.NewQuotationRepository(db).GetByID(ctx, draft.ID, compID)
	if err != nil || stored.CompanySnapshot == nil || stored.CustomerSnapshot == nil {
		t.Fatalf("snapshots missing: %+v %v", stored, err)
	}
}

func TestV6TemplateDeepCopyAndSaveAsTemplate(t *testing.T) {
	_, quotSvc, tmplSvc, _, compID := setupV5Env(t)
	ctx := context.Background()
	layout := v6Fixture(t)
	template, err := tmplSvc.CreateTemplate(ctx, compID, app_tmpl.TemplateCreateDTO{Name: "V6", Layout: layout})
	if err != nil {
		t.Fatal(err)
	}
	if template.SchemaVersion != 6 {
		t.Fatalf("template version=%d", template.SchemaVersion)
	}
	draft, err := quotSvc.CreateQuotationDraft(ctx, compID, app_quot.QuotationCreateDTO{TemplateID: template.ID})
	if err != nil {
		t.Fatal(err)
	}
	if draft.SchemaVersion != 6 {
		t.Fatalf("draft version=%d", draft.SchemaVersion)
	}
	edited := documentv6.NewBlank("edited")
	raw, _ := json.Marshal(edited)
	if _, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: draft.ID, Document: string(raw)}); err != nil {
		t.Fatal(err)
	}
	original, err := tmplSvc.GetTemplate(ctx, compID, template.ID)
	if err != nil || original.Layout != layout {
		t.Fatal("source template changed")
	}
	copy, err := quotSvc.SaveAsTemplate(ctx, compID, app_quot.SaveAsTemplateDTO{QuotationID: draft.ID, Name: "Copy"})
	if err != nil {
		t.Fatal(err)
	}
	if copy.SchemaVersion != 6 || copy.Layout != string(raw) {
		t.Fatal("save-as-template lost V6")
	}
}

func TestV6PreviewExportParityAndPageMap(t *testing.T) {
	db, quotSvc, _, _, compID := setupV5Env(t)
	ctx := context.Background()
	draft, err := quotSvc.CreateQuotationDraft(ctx, compID, app_quot.QuotationCreateDTO{UseV6: true})
	if err != nil {
		t.Fatal(err)
	}
	document := v6Fixture(t)
	if _, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: draft.ID, Document: document}); err != nil {
		t.Fatal(err)
	}
	docService := app_document.NewService(sqlite.NewQuotationRepository(db), sqlite.NewCompanyRepository(db), sqlite.NewCustomerRepository(db), pdf.NewGenerator(), pdf.NewLayoutMetrics())
	exportService := app_document.NewExportService(docService, sqlite.NewQuotationRepository(db), sqlite.NewCustomerRepository(db))
	preview, err := docService.GeneratePreviewPDF(ctx, compID, draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	exported, _, err := exportService.GeneratePDFBytes(ctx, compID, draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(preview, exported) || !bytes.HasPrefix(preview, []byte("%PDF")) {
		t.Fatal("V6 preview/export mismatch")
	}
	value, err := docService.ResolveDocumentLayoutDiagnostics(ctx, compID, draft.ID, document)
	if err != nil {
		t.Fatal(err)
	}
	pageMap, ok := value.(flowlayout.PageMap)
	if !ok || pageMap.PageCount < 1 || len(pageMap.Ranges) == 0 {
		t.Fatalf("unexpected page map: %#v", value)
	}
}

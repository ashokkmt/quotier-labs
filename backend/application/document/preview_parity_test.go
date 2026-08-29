package document_test

import (
	"bytes"
	"context"
	"testing"
	"time"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/pdf"
)

// Preview and export must travel the same authoritative generation path so the editor preview
// always matches the exported bytes.
func TestPreviewAndExportProduceIdenticalBytes(t *testing.T) {
	q := &domain.Quotation{
		ID:     "q-v5-parity",
		Number: "QT-2026-0099",
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
		},
		Document: `{"schema_version":5,"root":{"pages":[{"id":"page-1","width":59528,"height":84189,"margin":{"top":0,"right":0,"bottom":0,"left":0},"child_ids":["title"],"children":[{"id":"title","kind":"text","role":"element","geometry":{"x":7200,"y":7200,"width":30000,"height":4000,"rotation":0},"layout_mode":"fixed","visibility":"shown","props":{"text":"Parity Check"}}]}]},"settings":{"page_size":"A4","orientation":"portrait"}}`,
	}
	repo := &mockQuotationRepo{q: q}
	companyRepo := &mockCompanyRepo{c: &domain.Company{ID: "co1", Name: "Parity Co"}}
	customerRepo := &mockCustomerRepo{c: &domain.Customer{ID: "c1", Name: "Parity Customer"}}
	docService := document.NewService(repo, companyRepo, customerRepo, pdf.NewGenerator(), pdf.NewLayoutMetrics())
	exportService := document.NewExportService(docService, repo, customerRepo)

	preview, err := docService.GeneratePreviewPDF(context.Background(), "co1", "q-v5-parity")
	if err != nil {
		t.Fatalf("preview failed: %v", err)
	}
	exported, _, err := exportService.GeneratePDFBytes(context.Background(), "co1", "q-v5-parity")
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	if !bytes.Equal(preview, exported) {
		t.Fatal("preview and export bytes diverge")
	}
}

package document_test

import (
	"bytes"
	"context"
	"testing"
	"time"

	"encoding/json"
	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentv6"
	"quotierlabs/backend/infrastructure/pdf"
)

// Preview and export must travel the same authoritative generation path so the editor preview
// always matches the exported bytes.
func TestPreviewAndExportProduceIdenticalBytes(t *testing.T) {
	doc := documentv6.NewBlank("parity")
	raw, _ := json.Marshal(doc)
	q := &domain.Quotation{
		ID:     "q-v6-parity",
		Number: "QT-2026-0099",
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
		},
		Document: string(raw),
	}
	repo := &mockQuotationRepo{q: q}
	companyRepo := &mockCompanyRepo{c: &domain.Company{ID: "co1", Name: "Parity Co"}}
	customerRepo := &mockCustomerRepo{c: &domain.Customer{ID: "c1", Name: "Parity Customer"}}
	docService := document.NewService(repo, companyRepo, customerRepo, pdf.NewGenerator(), pdf.NewLayoutMetrics())
	exportService := document.NewExportService(docService, repo, customerRepo)

	preview, err := docService.GeneratePreviewPDF(context.Background(), "co1", "q-v6-parity")
	if err != nil {
		t.Fatalf("preview failed: %v", err)
	}
	exported, _, err := exportService.GeneratePDFBytes(context.Background(), "co1", "q-v6-parity")
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	if !bytes.Equal(preview, exported) {
		t.Fatal("preview and export bytes diverge")
	}
}

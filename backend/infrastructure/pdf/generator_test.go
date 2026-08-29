package pdf_test

import (
	"context"
	"testing"
	"time"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/pdf"
)

func TestPDFGenerator(t *testing.T) {
	generator := pdf.NewGenerator()

	companyName := "Test Company"
	taxId := "GSTIN1234"
	customerName := "Test Customer"

	q := &domain.Quotation{
		ID:     "q-1",
		Number: "QT-001",
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
		},
		Document:     `{"rows":[{"id":"r1","order":0,"columns":[{"id":"c1","order":0,"width":"100%","sections":[{"id":"s1","title":"Test Section","visibility":true,"fields":[{"id":"f1","label":"Field 1","value":"Value 1"}],"tables":[{"id":"t1","name":"Test Table","columns":[{"id":"tc1","label":"Col 1"}],"rows":[{"tc1":"Val 1"}]}]}]}]}]}`,
		Subtotal:     10000,
		TaxableTotal: 10000,
		CGSTTotal:    900,
		SGSTTotal:    900,
		GrandTotal:   11800,
	}

	comp := &domain.Company{
		Name:  companyName,
		TaxID: &taxId,
	}

	cust := &domain.Customer{
		Name: customerName,
	}

	input := document.GeneratorInput{
		Quotation: q,
		Company:   comp,
		Customer:  cust,
	}

	bytes, err := generator.Generate(context.Background(), input)
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}

	if len(bytes) == 0 {
		t.Errorf("expected non-empty pdf bytes")
	}

	// A basic valid PDF usually starts with %PDF-
	if string(bytes[:5]) != "%PDF-" {
		t.Errorf("output does not appear to be a PDF")
	}
}

func TestPDFGeneratorGeneratesV5DocumentThroughLayoutIR(t *testing.T) {
	generator := pdf.NewGenerator()
	q := &domain.Quotation{
		ID:            "q-v5",
		AuditMetadata: domain.AuditMetadata{CreatedAt: time.Now()},
		Document:      `{"schema_version":5,"root":{"pages":[{"id":"page-1","width":59528,"height":84189,"margin":{"top":0,"right":0,"bottom":0,"left":0},"child_ids":["title"],"children":[{"id":"title","kind":"text","role":"element","geometry":{"x":7200,"y":7200,"width":14400,"height":3600,"rotation":0},"layout_mode":"fixed","visibility":"shown","props":{"text":"V5 PDF"}}]}]},"settings":{"page_size":"A4","orientation":"portrait"}}`,
	}
	bytes, err := generator.Generate(context.Background(), document.GeneratorInput{Quotation: q})
	if err != nil {
		t.Fatalf("Generate V5 failed: %v", err)
	}
	if len(bytes) < 5 || string(bytes[:5]) != "%PDF-" {
		t.Fatalf("output does not appear to be a PDF")
	}
}

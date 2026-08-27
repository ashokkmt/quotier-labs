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
		ID:        "q-1",
		Number:    "QT-001",
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now(),
		},
		Document:  `{"rows":[{"id":"r1","order":0,"columns":[{"id":"c1","order":0,"width":"100%","sections":[{"id":"s1","title":"Test Section","visibility":true,"fields":[{"id":"f1","label":"Field 1","value":"Value 1"}],"tables":[{"id":"t1","name":"Test Table","columns":[{"id":"tc1","label":"Col 1"}],"rows":[{"tc1":"Val 1"}]}]}]}]}]}`,
		Subtotal:  10000,
		TaxableTotal: 10000,
		CGSTTotal: 900,
		SGSTTotal: 900,
		GrandTotal: 11800,
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

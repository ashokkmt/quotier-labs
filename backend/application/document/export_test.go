package document_test

import (
	"context"
	"testing"
	"time"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/pdf"
)

type mockQuotationRepo struct {
	domain.QuotationRepository
	q *domain.Quotation
}

func (m *mockQuotationRepo) GetByID(ctx context.Context, id, companyID string) (*domain.Quotation, error) {
	return m.q, nil
}

type mockCompanyRepo struct {
	domain.CompanyRepository
	c *domain.Company
}

func (m *mockCompanyRepo) GetByID(ctx context.Context, id string) (*domain.Company, error) {
	return m.c, nil
}

type mockCustomerRepo struct {
	domain.CustomerRepository
	c *domain.Customer
}

func (m *mockCustomerRepo) GetByID(ctx context.Context, id, companyID string) (*domain.Customer, error) {
	return m.c, nil
}

func TestGeneratePDFBytes(t *testing.T) {
	docService := document.NewService(
		&mockQuotationRepo{q: &domain.Quotation{ID: "q1", Number: "QT-001", CustomerID: "c1", Document: "{}"}},
		&mockCompanyRepo{c: &domain.Company{ID: "co1", Name: "Test Co"}},
		&mockCustomerRepo{c: &domain.Customer{ID: "c1", Name: "Test Cust"}},
		pdf.NewGenerator(),
	)

	exportService := document.NewExportService(
		docService,
		&mockQuotationRepo{q: &domain.Quotation{ID: "q1", Number: "QT-001", CustomerID: "c1", Document: "{}"}},
		&mockCustomerRepo{c: &domain.Customer{ID: "c1", Name: "Test Cust"}},
	)

	bytes, filename, err := exportService.GeneratePDFBytes(context.Background(), "co1", "q1")
	if err != nil {
		t.Fatalf("GeneratePDFBytes failed: %v", err)
	}

	if len(bytes) == 0 {
		t.Errorf("expected non-empty bytes")
	}

	expectedPrefix := "QT-001_Test Cust_" + time.Now().Format("2006-01-02") + ".pdf"
	if filename != expectedPrefix {
		t.Errorf("expected filename %q, got %q", expectedPrefix, filename)
	}
}

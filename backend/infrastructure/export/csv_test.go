package export_test

import (
	"context"
	"encoding/csv"
	"os"
	"path/filepath"
	"testing"
	"time"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/export"
)

type MockQuotationRepo struct {
	domain.QuotationRepository
}

func (m *MockQuotationRepo) List(ctx context.Context, companyID string, filter domain.QuotationListFilter) ([]domain.Quotation, error) {
	return []domain.Quotation{
		{Number: "QT-1", CustomerID: "cust-1", Status: "FINALIZED", GrandTotal: 10000, AuditMetadata: domain.AuditMetadata{CreatedAt: time.Now()}},
	}, nil
}

func TestExportQuotations(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "export_test_*")
	defer os.RemoveAll(tempDir)

	svc := export.NewCSVExportService(&MockQuotationRepo{}, nil)
	path := filepath.Join(tempDir, "quotes.csv")

	res, err := svc.ExportQuotations(context.Background(), "comp-1", path)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}
	if !res.Success {
		t.Fatalf("export not successful")
	}

	f, _ := os.Open(path)
	defer f.Close()
	r := csv.NewReader(f)
	records, _ := r.ReadAll()

	if len(records) != 2 {
		t.Fatalf("expected 2 rows, got %v", len(records))
	}
	if records[1][0] != "QT-1" {
		t.Errorf("expected QT-1, got %v", records[1][0])
	}
}

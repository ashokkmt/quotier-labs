package export

import (
	"context"
	"encoding/csv"
	"fmt"
	"os"

	"quotierlabs/backend/domain"
	backup_domain "quotierlabs/backend/domain/backup"
)

type CSVExportService struct {
	quotationRepo domain.QuotationRepository
	customerRepo  domain.CustomerRepository
}

func NewCSVExportService(qRepo domain.QuotationRepository, cRepo domain.CustomerRepository) *CSVExportService {
	return &CSVExportService{
		quotationRepo: qRepo,
		customerRepo:  cRepo,
	}
}

func (s *CSVExportService) ExportQuotations(ctx context.Context, companyID string, destPath string) (*backup_domain.ExportResult, error) {
	quotes, err := s.quotationRepo.List(ctx, companyID, domain.QuotationListFilter{})
	if err != nil {
		return nil, err
	}

	f, err := os.Create(destPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	// Write header
	_ = w.Write([]string{"Number", "CustomerID", "Status", "GrandTotal", "Date"})
	for _, q := range quotes {
		_ = w.Write([]string{
			q.Number,
			q.CustomerID,
			q.Status,
			fmt.Sprintf("%.2f", float64(q.GrandTotal)/100.0),
			q.CreatedAt.Format("2006-01-02"),
		})
	}
	
	return &backup_domain.ExportResult{Path: destPath, Success: true}, nil
}

func (s *CSVExportService) ExportCustomers(ctx context.Context, companyID string, destPath string) (*backup_domain.ExportResult, error) {
	customers, err := s.customerRepo.List(ctx, companyID, domain.CustomerListFilter{})
	if err != nil {
		return nil, err
	}

	f, err := os.Create(destPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	// Write header
	_ = w.Write([]string{"Name", "Email", "Phone", "Address", "GSTIN", "PAN"})
	for _, c := range customers {
		_ = w.Write([]string{
			c.Name,
			getStr(c.Email),
			getStr(c.Phone),
			getStr(c.Address),
			getStr(c.GSTIN),
			getStr(c.PAN),
		})
	}
	
	return &backup_domain.ExportResult{Path: destPath, Success: true}, nil
}

func getStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

package document

import (
	"context"
	"fmt"
	"quotierlabs/backend/domain"
	"time"
)

type PrintService interface {
	PrintPDF(filePath string) error
}

type ShareService interface {
	SharePDF(filePath string) error
	OpenPDF(filePath string) error
}

type ExportService struct {
	docService    *Service
	quotationRepo domain.QuotationRepository
	customerRepo  domain.CustomerRepository
}

func NewExportService(docService *Service, quotationRepo domain.QuotationRepository, customerRepo domain.CustomerRepository) *ExportService {
	return &ExportService{
		docService:    docService,
		quotationRepo: quotationRepo,
		customerRepo:  customerRepo,
	}
}

func (s *ExportService) GeneratePDFBytes(ctx context.Context, companyID, quotationID string) ([]byte, string, error) {
	bytes, err := s.docService.GeneratePreviewPDF(ctx, companyID, quotationID)
	if err != nil {
		return nil, "", err
	}

	q, err := s.quotationRepo.GetByID(ctx, quotationID, companyID)
	if err != nil {
		return nil, "", err
	}

	customerName := "Customer"
	if q.CustomerID != "" {
		cust, err := s.customerRepo.GetByID(ctx, q.CustomerID, companyID)
		if err == nil {
			customerName = cust.Name
		}
	}

	// Default filename: {QuotationNumber}_{CustomerName}_{Date}.pdf
	dateStr := time.Now().Format("2006-01-02")
	defaultFilename := fmt.Sprintf("%s_%s_%s.pdf", q.Number, customerName, dateStr)

	return bytes, defaultFilename, nil
}

package document

import (
	"context"
	"fmt"
	appdiagnostics "quotierlabs/backend/application/diagnostics"
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
	recorder      appdiagnostics.Recorder
}

func NewExportService(docService *Service, quotationRepo domain.QuotationRepository, customerRepo domain.CustomerRepository, recorders ...appdiagnostics.Recorder) *ExportService {
	recorder := appdiagnostics.Recorder(appdiagnostics.NopRecorder{})
	if len(recorders) > 0 && recorders[0] != nil {
		recorder = recorders[0]
	}
	return &ExportService{
		docService:    docService,
		quotationRepo: quotationRepo,
		customerRepo:  customerRepo,
		recorder:      recorder,
	}
}

func (s *ExportService) GeneratePDFBytes(ctx context.Context, companyID, quotationID string) (bytes []byte, filename string, err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		s.recorder.RecordOperation(ctx, "pdf.export", time.Since(started), result, nil)
	}()
	bytes, err = s.docService.GeneratePreviewPDF(ctx, companyID, quotationID)
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

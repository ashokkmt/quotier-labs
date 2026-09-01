package document

import (
	"context"
	"fmt"
	"quotierlabs/backend/domain"
	"time"
)

func (s *Service) GeneratePreviewPDF(ctx context.Context, companyID, quotationID string) (out []byte, err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		s.recorder.RecordOperation(ctx, "preview.generate", time.Since(started), result, nil)
	}()
	q, err := s.quotationRepo.GetByID(ctx, quotationID, companyID)
	if err != nil {
		return nil, fmt.Errorf("get quotation: %w", err)
	}

	comp, err := s.companyRepo.GetByID(ctx, companyID)
	if err != nil {
		return nil, fmt.Errorf("get company: %w", err)
	}

	var cust *domain.Customer
	if q.CustomerID != "" {
		cust, _ = s.customerRepo.GetByID(ctx, q.CustomerID, companyID)
	}

	input := GeneratorInput{
		Quotation: q,
		Company:   comp,
		Customer:  cust,
	}

	return s.pdfGenerator.Generate(ctx, input)
}

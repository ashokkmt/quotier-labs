package document

import (
	"context"
	"fmt"
	"quotierlabs/backend/domain"
)

func (s *Service) GeneratePreviewPDF(ctx context.Context, companyID, quotationID string) ([]byte, error) {
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

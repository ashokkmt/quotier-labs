package document

import (
	"context"

	"quotierlabs/backend/domain"
)

type GeneratorInput struct {
	Quotation *domain.Quotation
	Company   *domain.Company
	Customer  *domain.Customer
}

type PDFGenerator interface {
	Generate(ctx context.Context, input GeneratorInput) ([]byte, error)
}

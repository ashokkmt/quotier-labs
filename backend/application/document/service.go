package document

import (
	"quotierlabs/backend/domain"
)

type Service struct {
	quotationRepo domain.QuotationRepository
	companyRepo   domain.CompanyRepository
	customerRepo  domain.CustomerRepository
	pdfGenerator  PDFGenerator
}

func NewService(
	quotationRepo domain.QuotationRepository,
	companyRepo domain.CompanyRepository,
	customerRepo domain.CustomerRepository,
	pdfGenerator PDFGenerator,
) *Service {
	return &Service{
		quotationRepo: quotationRepo,
		companyRepo:   companyRepo,
		customerRepo:  customerRepo,
		pdfGenerator:  pdfGenerator,
	}
}

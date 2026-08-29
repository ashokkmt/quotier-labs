package document

import (
	"context"
	"crypto/sha256"
	"fmt"
	"quotierlabs/backend/application/documentmigration"
	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/quotation"
)

// MigrateDocumentToV5 is a pure compatibility boundary used by the guarded frontend cutover.
// IDs are deterministic for the same input, making retries and recovery checkpoints stable.
func (s *Service) MigrateDocumentToV5(raw string) (string, error) {
	counter := 0
	nextID := func(prefix string) string {
		counter++
		sum := sha256.Sum256([]byte(fmt.Sprintf("%s:%d:%s", prefix, counter, raw)))
		return fmt.Sprintf("%s-%x", prefix, sum[:8])
	}
	encoded, err := documentmigration.MigrateAndMarshal([]byte(raw), nextID)
	if err != nil {
		return "", fmt.Errorf("migrate document: %w", err)
	}
	return string(encoded), nil
}

type Service struct {
	quotationRepo domain.QuotationRepository
	companyRepo   domain.CompanyRepository
	customerRepo  domain.CustomerRepository
	pdfGenerator  PDFGenerator
}

// ResolveQuotationLayoutDiagnostics exposes safe, renderer-derived V5 diagnostics for preview UI.
// V1–V4 continue through their legacy preview path and return no V5 diagnostics.
func (s *Service) ResolveQuotationLayoutDiagnostics(ctx context.Context, companyID, quotationID string) ([]layoutir.Diagnostic, error) {
	q, err := s.quotationRepo.GetByID(ctx, quotationID, companyID)
	if err != nil {
		return nil, fmt.Errorf("get quotation: %w", err)
	}
	version, err := quotation.DocumentSchemaVersion(q.Document)
	if err != nil {
		return nil, fmt.Errorf("inspect document: %w", err)
	}
	if version != documentmodel.SchemaVersion {
		return []layoutir.Diagnostic{}, nil
	}
	company, err := s.companyRepo.GetByID(ctx, companyID)
	if err != nil {
		return nil, fmt.Errorf("get company: %w", err)
	}
	var customer *domain.Customer
	if q.CustomerID != "" {
		customer, _ = s.customerRepo.GetByID(ctx, q.CustomerID, companyID)
	}
	doc, err := documentmodel.Parse([]byte(q.Document))
	if err != nil {
		return nil, fmt.Errorf("parse V5 document: %w", err)
	}
	layout, err := layoutir.ResolveWithInput(ctx, doc, layoutir.ResolveInput{Company: company, Customer: customer, Quotation: q})
	if err != nil {
		return nil, fmt.Errorf("resolve V5 layout: %w", err)
	}
	return layout.Diagnostics, nil
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

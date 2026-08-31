package document

import (
	"context"
	"fmt"
	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
	domain_quotation "quotierlabs/backend/domain/quotation"
)

type Service struct {
	quotationRepo domain.QuotationRepository
	companyRepo   domain.CompanyRepository
	customerRepo  domain.CustomerRepository
	pdfGenerator  PDFGenerator
	metrics       layoutir.Metrics
}

// ResolveQuotationLayoutDiagnostics exposes safe, renderer-derived V5 diagnostics for preview UI.
func (s *Service) ResolveQuotationLayoutDiagnostics(ctx context.Context, companyID, quotationID string) ([]layoutir.Diagnostic, error) {
	q, err := s.quotationRepo.GetByID(ctx, quotationID, companyID)
	if err != nil {
		return nil, fmt.Errorf("get quotation: %w", err)
	}
	return s.resolveDiagnostics(ctx, q, companyID, q.Document)
}

// ResolveDocumentLayoutDiagnostics resolves diagnostics for an in-progress document without
// persisting it, letting the editor surface authoritative warnings between autosaves. The raw
// document is size-bounded and strictly validated; only typed diagnostics are returned.
func (s *Service) ResolveDocumentLayoutDiagnostics(ctx context.Context, companyID, quotationID, rawDocument string) ([]layoutir.Diagnostic, error) {
	const maxDocumentBytes = 8 << 20
	if len(rawDocument) == 0 || len(rawDocument) > maxDocumentBytes {
		return nil, &domain.ValidationError{Field: "document", Message: "document size is out of bounds"}
	}
	q, err := s.quotationRepo.GetByID(ctx, quotationID, companyID)
	if err != nil {
		return nil, fmt.Errorf("get quotation: %w", err)
	}
	if q.Status != string(domain_quotation.StatusDraft) {
		return nil, domain.ErrInvalidTransition
	}
	return s.resolveDiagnostics(ctx, q, companyID, rawDocument)
}

func (s *Service) resolveDiagnostics(ctx context.Context, q *domain.Quotation, companyID, rawDocument string) ([]layoutir.Diagnostic, error) {
	company, err := s.companyRepo.GetByID(ctx, companyID)
	if err != nil {
		return nil, fmt.Errorf("get company: %w", err)
	}
	var customer *domain.Customer
	if q.CustomerID != "" {
		customer, _ = s.customerRepo.GetByID(ctx, q.CustomerID, companyID)
	}
	doc, err := documentmodel.Parse([]byte(rawDocument))
	if err != nil {
		return nil, fmt.Errorf("parse V5 document: %w", err)
	}
	layout, err := layoutir.ResolveWithMetrics(ctx, doc, layoutir.ResolveInput{Company: company, Customer: customer, Quotation: q}, s.metrics)
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
	metrics layoutir.Metrics,
) *Service {
	if metrics == nil {
		metrics = layoutir.DefaultMetrics{}
	}
	return &Service{
		quotationRepo: quotationRepo,
		companyRepo:   companyRepo,
		customerRepo:  customerRepo,
		pdfGenerator:  pdfGenerator,
		metrics:       metrics,
	}
}

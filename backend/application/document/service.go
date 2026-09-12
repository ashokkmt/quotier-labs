package document

import (
	"context"
	"fmt"
	appdiagnostics "quotierlabs/backend/application/diagnostics"
	"quotierlabs/backend/application/flowlayout"
	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentformat"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/documentv6"
	domain_quotation "quotierlabs/backend/domain/quotation"
	"time"
)

type Service struct {
	quotationRepo domain.QuotationRepository
	companyRepo   domain.CompanyRepository
	customerRepo  domain.CustomerRepository
	pdfGenerator  PDFGenerator
	metrics       layoutir.Metrics
	recorder      appdiagnostics.Recorder
}

// ResolveQuotationLayoutDiagnostics exposes safe, renderer-derived V5 diagnostics for preview UI.
func (s *Service) ResolveQuotationLayoutDiagnostics(ctx context.Context, companyID, quotationID string) (interface{}, error) {
	q, err := s.quotationRepo.GetByID(ctx, quotationID, companyID)
	if err != nil {
		return nil, fmt.Errorf("get quotation: %w", err)
	}
	return s.resolveDiagnostics(ctx, q, companyID, q.Document)
}

// ResolveDocumentLayoutDiagnostics resolves diagnostics for an in-progress document without
// persisting it, letting the editor surface authoritative warnings between autosaves. The raw
// document is size-bounded and strictly validated; only typed diagnostics are returned.
func (s *Service) ResolveDocumentLayoutDiagnostics(ctx context.Context, companyID, quotationID, rawDocument string) (interface{}, error) {
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

func (s *Service) resolveDiagnostics(ctx context.Context, q *domain.Quotation, companyID, rawDocument string) (diagnostics interface{}, err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		s.recorder.RecordOperation(ctx, "layout.resolve", time.Since(started), result, nil)
	}()
	company, err := s.companyRepo.GetByID(ctx, companyID)
	if err != nil {
		return nil, fmt.Errorf("get company: %w", err)
	}
	var customer *domain.Customer
	if q.CustomerID != "" {
		customer, _ = s.customerRepo.GetByID(ctx, q.CustomerID, companyID)
	}
	version, err := documentformat.Validate([]byte(rawDocument))
	if err != nil {
		return nil, fmt.Errorf("parse document: %w", err)
	}
	if version == documentmodel.SchemaVersion {
		doc, parseErr := documentmodel.Parse([]byte(rawDocument))
		if parseErr != nil {
			return nil, parseErr
		}
		layout, resolveErr := layoutir.ResolveWithMetrics(ctx, doc, layoutir.ResolveInput{Company: company, Customer: customer, Quotation: q}, s.metrics)
		if resolveErr != nil {
			return nil, fmt.Errorf("resolve V5 layout: %w", resolveErr)
		}
		return layout.Diagnostics, nil
	}
	doc, parseErr := documentv6.Parse([]byte(rawDocument))
	if parseErr != nil {
		return nil, parseErr
	}
	layout, resolveErr := flowlayout.Resolve(ctx, doc, flowlayout.ResolveInput{Company: company, Customer: customer, Quotation: q}, s.metrics)
	if resolveErr != nil {
		return nil, fmt.Errorf("resolve V6 layout: %w", resolveErr)
	}
	return layout.PageMap(doc), nil
}

func NewService(
	quotationRepo domain.QuotationRepository,
	companyRepo domain.CompanyRepository,
	customerRepo domain.CustomerRepository,
	pdfGenerator PDFGenerator,
	metrics layoutir.Metrics,
	recorders ...appdiagnostics.Recorder,
) *Service {
	if metrics == nil {
		metrics = layoutir.DefaultMetrics{}
	}
	recorder := appdiagnostics.Recorder(appdiagnostics.NopRecorder{})
	if len(recorders) > 0 && recorders[0] != nil {
		recorder = recorders[0]
	}
	return &Service{
		quotationRepo: quotationRepo,
		companyRepo:   companyRepo,
		customerRepo:  customerRepo,
		pdfGenerator:  pdfGenerator,
		metrics:       metrics,
		recorder:      recorder,
	}
}

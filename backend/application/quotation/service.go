package quotation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"quotierlabs/backend/domain"
	domain_quotation "quotierlabs/backend/domain/quotation"
)

var (
	ErrQuotationNotDraft = errors.New("quotation is not in DRAFT status")
)

type Service struct {
	repo         domain.QuotationRepository
	templateRepo domain.TemplateRepository
	customerRepo domain.CustomerRepository
	companyRepo  domain.CompanyRepository
	seqRepo      domain.NumberSequenceRepository
	resolver     *domain_quotation.TemplateResolver
	txManager    domain.TxManager
	idGen        domain.IDGenerator
}

func NewService(
	repo domain.QuotationRepository,
	templateRepo domain.TemplateRepository,
	customerRepo domain.CustomerRepository,
	companyRepo domain.CompanyRepository,
	seqRepo domain.NumberSequenceRepository,
	resolver *domain_quotation.TemplateResolver,
	txManager domain.TxManager,
	idGen domain.IDGenerator,
) *Service {
	return &Service{
		repo:         repo,
		templateRepo: templateRepo,
		customerRepo: customerRepo,
		companyRepo:  companyRepo,
		seqRepo:      seqRepo,
		resolver:     resolver,
		txManager:    txManager,
		idGen:        idGen,
	}
}

func mapToDTO(q *domain.Quotation) QuotationDTO {
	return QuotationDTO{
		ID:            q.ID,
		CompanyID:     q.CompanyID,
		TemplateID:    q.TemplateID,
		CustomerID:    q.CustomerID,
		Number:        q.Number,
		Status:        q.Status,
		Document:      q.Document,
		Subtotal:      q.Subtotal,
		DiscountTotal: q.DiscountTotal,
		TaxableTotal:  q.TaxableTotal,
		CGSTTotal:     q.CGSTTotal,
		SGSTTotal:     q.SGSTTotal,
		IGSTTotal:     q.IGSTTotal,
		GrandTotal:    q.GrandTotal,
		ValidUntil:    q.ValidUntil,
		Notes:         q.Notes,
		CreatedAt:     q.CreatedAt,
		UpdatedAt:     q.UpdatedAt,
	}
}

func (s *Service) CreateQuotationDraft(ctx context.Context, companyID string, input QuotationCreateDTO) (*QuotationDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer s.txManager.Rollback(txCtx)

	// Fetch dependencies
	tmpl, err := s.templateRepo.GetByID(txCtx, input.TemplateID)
	if err != nil {
		return nil, fmt.Errorf("template not found: %w", err)
	}
	if !tmpl.IsBuiltin && (tmpl.CompanyID == nil || *tmpl.CompanyID != companyID) {
		return nil, domain.ErrNotFound
	}

	cust, err := s.customerRepo.GetByID(txCtx, input.CustomerID, companyID)
	if err != nil {
		return nil, fmt.Errorf("customer not found: %w", err)
	}
	if cust.CompanyID != companyID {
		return nil, domain.ErrNotFound
	}

	comp, err := s.companyRepo.GetByID(txCtx, companyID)
	if err != nil {
		return nil, fmt.Errorf("company not found: %w", err)
	}

	// Resolve document
	doc, err := s.resolver.Resolve(txCtx, tmpl)
	if err != nil {
		return nil, err
	}
	docJSON, err := doc.ToJSON()
	if err != nil {
		return nil, err
	}

	// Generate sequence number
	year := time.Now().UTC().Year()
	seq, err := s.seqRepo.ReserveNext(txCtx, companyID, "QUOTATION", year)
	if err != nil {
		return nil, err
	}
	formattedSeq := fmt.Sprintf("QT-%d-%04d", year, seq)

	// Create snapshots
	compSnap, _ := json.Marshal(comp)
	custSnap, _ := json.Marshal(cust)
	tmplSnap, _ := json.Marshal(tmpl)

	compSnapStr := string(compSnap)
	custSnapStr := string(custSnap)
	tmplSnapStr := string(tmplSnap)

	q := &domain.Quotation{
		ID:               s.idGen.Generate(),
		CompanyID:        companyID,
		TemplateID:       input.TemplateID,
		CustomerID:       input.CustomerID,
		Number: formattedSeq,
		Status:        string(domain_quotation.StatusDraft),
		Document:         docJSON,
		CompanySnapshot:  &compSnapStr,
		CustomerSnapshot: &custSnapStr,
		TemplateSnapshot: &tmplSnapStr,
		SchemaVersion:    1,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
			Version:   1,
		},
	}

	if err := domain_quotation.ValidateQuotation(q); err != nil {
		return nil, err
	}

	if err := s.repo.Create(txCtx, q); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	dto := mapToDTO(q)
	return &dto, nil
}

func (s *Service) UpdateQuotationDocument(ctx context.Context, companyID string, input QuotationUpdateDocumentDTO) (*QuotationDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer s.txManager.Rollback(txCtx)

	q, err := s.repo.GetByID(txCtx, input.ID, companyID)
	if err != nil {
		return nil, err
	}
	if q.CompanyID != companyID {
		return nil, domain.ErrNotFound
	}
	if q.Status != string(domain_quotation.StatusDraft) {
		return nil, ErrQuotationNotDraft
	}

	q.Document = input.Document
	q.UpdatedAt = time.Now().UTC()

	if err := domain_quotation.ValidateQuotation(q); err != nil {
		return nil, err
	}

	if err := s.repo.Update(txCtx, q); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	dto := mapToDTO(q)
	return &dto, nil
}

func (s *Service) UpdateQuotationCustomer(ctx context.Context, companyID string, input QuotationUpdateCustomerDTO) (*QuotationDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer s.txManager.Rollback(txCtx)

	q, err := s.repo.GetByID(txCtx, input.ID, companyID)
	if err != nil {
		return nil, err
	}
	if q.CompanyID != companyID {
		return nil, domain.ErrNotFound
	}
	if q.Status != string(domain_quotation.StatusDraft) {
		return nil, ErrQuotationNotDraft
	}

	cust, err := s.customerRepo.GetByID(txCtx, input.CustomerID, companyID)
	if err != nil {
		return nil, fmt.Errorf("customer not found: %w", err)
	}
	if cust.CompanyID != companyID {
		return nil, domain.ErrNotFound
	}

	custSnap, _ := json.Marshal(cust)
	custSnapStr := string(custSnap)

	q.CustomerID = input.CustomerID
	q.CustomerSnapshot = &custSnapStr
	q.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(txCtx, q); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	dto := mapToDTO(q)
	return &dto, nil
}

func (s *Service) GetQuotation(ctx context.Context, companyID, id string) (*QuotationDTO, error) {
	q, err := s.repo.GetByID(ctx, id, companyID)
	if err != nil {
		return nil, err
	}
	if q.CompanyID != companyID {
		return nil, domain.ErrNotFound
	}
	dto := mapToDTO(q)
	return &dto, nil
}


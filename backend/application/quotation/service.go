package quotation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
	domain_quotation "quotierlabs/backend/domain/quotation"
)

var (
	ErrQuotationNotDraft = errors.New("quotation is not in DRAFT status")
)

type Service struct {
	repo          domain.QuotationRepository
	templateRepo  domain.TemplateRepository
	customerRepo  domain.CustomerRepository
	companyRepo   domain.CompanyRepository
	seqRepo       domain.NumberSequenceRepository
	txManager     domain.TxManager
	idGen         domain.IDGenerator
	layoutMetrics layoutir.Metrics
}

func NewService(
	repo domain.QuotationRepository,
	templateRepo domain.TemplateRepository,
	customerRepo domain.CustomerRepository,
	companyRepo domain.CompanyRepository,
	seqRepo domain.NumberSequenceRepository,
	txManager domain.TxManager,
	idGen domain.IDGenerator,
	layoutMetrics layoutir.Metrics,
) *Service {
	if layoutMetrics == nil {
		layoutMetrics = layoutir.DefaultMetrics{}
	}
	return &Service{
		repo:          repo,
		templateRepo:  templateRepo,
		customerRepo:  customerRepo,
		companyRepo:   companyRepo,
		seqRepo:       seqRepo,
		txManager:     txManager,
		idGen:         idGen,
		layoutMetrics: layoutMetrics,
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
		SchemaVersion: q.SchemaVersion,
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
	defer func() { _ = s.txManager.Rollback(txCtx) }()

	// A draft can start empty. Templates and customers are selected later in the builder.
	var tmpl *domain.Template
	if input.TemplateID != "" {
		tmpl, err = s.templateRepo.GetByID(txCtx, input.TemplateID)
		if err != nil {
			return nil, fmt.Errorf("template not found: %w", err)
		}
		if !tmpl.IsBuiltin && (tmpl.CompanyID == nil || *tmpl.CompanyID != companyID) {
			return nil, domain.ErrNotFound
		}
	}
	var cust *domain.Customer
	if input.CustomerID != "" {
		cust, err = s.customerRepo.GetByID(txCtx, input.CustomerID, companyID)
		if err != nil {
			return nil, fmt.Errorf("customer not found: %w", err)
		}
		if cust.CompanyID != companyID {
			return nil, domain.ErrNotFound
		}
	}

	comp, err := s.companyRepo.GetByID(txCtx, companyID)
	if err != nil {
		return nil, fmt.Errorf("company not found: %w", err)
	}

	var docJSON string
	var docVersion int
	if tmpl != nil {
		docJSON, docVersion, err = s.resolveDraftDocument(tmpl)
	} else {
		raw, marshalErr := json.Marshal(documentmodel.NewBlank(s.idGen.Generate()))
		docJSON, err = string(raw), marshalErr
		docVersion = documentmodel.SchemaVersion
	}
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
	var custSnap, tmplSnap []byte
	if cust != nil {
		custSnap, _ = json.Marshal(cust)
	}
	if tmpl != nil {
		tmplSnap, _ = json.Marshal(tmpl)
	}

	compSnapStr := string(compSnap)
	var custSnapStr, tmplSnapStr *string
	if len(custSnap) > 0 {
		v := string(custSnap)
		custSnapStr = &v
	}
	if len(tmplSnap) > 0 {
		v := string(tmplSnap)
		tmplSnapStr = &v
	}

	q := &domain.Quotation{
		ID:               s.idGen.Generate(),
		CompanyID:        companyID,
		TemplateID:       input.TemplateID,
		CustomerID:       input.CustomerID,
		Number:           formattedSeq,
		Status:           string(domain_quotation.StatusDraft),
		Document:         docJSON,
		CompanySnapshot:  &compSnapStr,
		CustomerSnapshot: custSnapStr,
		TemplateSnapshot: tmplSnapStr,
		SchemaVersion:    docVersion,
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

// resolveDraftDocument validates and deep-copies a V5 template. Templates and quotations are
// separate persisted values even when their initial JSON is identical.
func (s *Service) resolveDraftDocument(tmpl *domain.Template) (string, int, error) {
	parsed, err := documentmodel.Parse([]byte(tmpl.Layout))
	if err != nil {
		return "", 0, fmt.Errorf("invalid V5 template layout: %w", err)
	}
	out, err := json.Marshal(parsed)
	if err != nil {
		return "", 0, err
	}
	return string(out), documentmodel.SchemaVersion, nil
}

func (s *Service) SaveAsTemplate(ctx context.Context, companyID string, input SaveAsTemplateDTO) (*domain.Template, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, &domain.ValidationError{Field: "name", Message: "template name is required"}
	}
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()
	q, err := s.repo.GetByID(txCtx, input.QuotationID, companyID)
	if err != nil {
		return nil, err
	}
	if q.Status != string(domain_quotation.StatusDraft) {
		return nil, ErrQuotationNotDraft
	}
	_, err = documentmodel.Parse([]byte(q.Document))
	if err != nil {
		return nil, fmt.Errorf("invalid quotation document: %w", err)
	}
	t := &domain.Template{ID: s.idGen.Generate(), CompanyID: &companyID, Name: name, Layout: q.Document, SchemaVersion: documentmodel.SchemaVersion, CurrentVersion: 1, AuditMetadata: domain.AuditMetadata{CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(), Version: 1}}
	if err := s.templateRepo.Create(txCtx, t); err != nil {
		return nil, err
	}
	if err := s.templateRepo.CreateVersion(txCtx, &domain.TemplateVersion{ID: s.idGen.Generate(), TemplateID: t.ID, Version: 1, Layout: t.Layout, SchemaVersion: documentmodel.SchemaVersion, CreatedAt: t.CreatedAt}); err != nil {
		return nil, err
	}
	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) UpdateQuotationDocument(ctx context.Context, companyID string, input QuotationUpdateDocumentDTO) (*QuotationDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()

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

	if _, err := documentmodel.Parse([]byte(input.Document)); err != nil {
		return nil, &domain.ValidationError{Field: "document", Message: "document must be a valid schema 5 document"}
	}
	q.Document = input.Document
	q.SchemaVersion = documentmodel.SchemaVersion
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
	defer func() { _ = s.txManager.Rollback(txCtx) }()

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

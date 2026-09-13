package quotation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	appdiagnostics "quotierlabs/backend/application/diagnostics"
	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentformat"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/documentv6"
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
	recorder      appdiagnostics.Recorder
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
	recorders ...appdiagnostics.Recorder,
) *Service {
	if layoutMetrics == nil {
		layoutMetrics = layoutir.DefaultMetrics{}
	}
	recorder := appdiagnostics.Recorder(appdiagnostics.NopRecorder{})
	if len(recorders) > 0 && recorders[0] != nil {
		recorder = recorders[0]
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
		recorder:      recorder,
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
		ExpectedTotal: q.ExpectedTotal,
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
		blank := any(documentmodel.NewBlank(s.idGen.Generate()))
		docVersion = documentmodel.SchemaVersion
		if input.UseV6 {
			blank = documentv6.NewBlank(s.idGen.Generate())
			docVersion = documentv6.SchemaVersion
		}
		raw, marshalErr := json.Marshal(blank)
		docJSON, err = string(raw), marshalErr
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

// resolveDraftDocument validates and deep-copies a supported template. Templates and quotations are
// separate persisted values even when their initial JSON is identical.
func (s *Service) resolveDraftDocument(tmpl *domain.Template) (string, int, error) {
	version, err := documentformat.Validate([]byte(tmpl.Layout))
	if err != nil {
		return "", 0, fmt.Errorf("invalid template layout: %w", err)
	}
	var copied any
	if err := json.Unmarshal([]byte(tmpl.Layout), &copied); err != nil {
		return "", 0, err
	}
	out, err := json.Marshal(copied)
	if err != nil {
		return "", 0, err
	}
	return string(out), version, nil
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
	version, err := documentformat.Validate([]byte(q.Document))
	if err != nil {
		return nil, fmt.Errorf("invalid quotation document: %w", err)
	}
	t := &domain.Template{ID: s.idGen.Generate(), CompanyID: &companyID, Name: name, Layout: q.Document, SchemaVersion: version, CurrentVersion: 1, AuditMetadata: domain.AuditMetadata{CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(), Version: 1}}
	if err := s.templateRepo.Create(txCtx, t); err != nil {
		return nil, err
	}
	if err := s.templateRepo.CreateVersion(txCtx, &domain.TemplateVersion{ID: s.idGen.Generate(), TemplateID: t.ID, Version: 1, Layout: t.Layout, SchemaVersion: version, CreatedAt: t.CreatedAt}); err != nil {
		return nil, err
	}
	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) UpdateQuotationDocument(ctx context.Context, companyID string, input QuotationUpdateDocumentDTO) (dto *QuotationDTO, err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		s.recorder.RecordOperation(ctx, "quotation.save", time.Since(started), result, nil)
	}()
	// A document save can race a customer or expected-total update. Retry once
	// from a fresh draft instead of leaving autosave permanently behind.
	for attempt := 0; attempt < 2; attempt++ {
		dto, err = s.updateQuotationDocument(ctx, companyID, input)
		if !errors.Is(err, domain.ErrConflict) {
			return dto, err
		}
	}
	return nil, err
}

func (s *Service) updateQuotationDocument(ctx context.Context, companyID string, input QuotationUpdateDocumentDTO) (*QuotationDTO, error) {
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

	version, err := documentformat.Validate([]byte(input.Document))
	if err != nil {
		return nil, &domain.ValidationError{Field: "document", Message: "document must be a valid supported document"}
	}
	q.Document = input.Document
	q.SchemaVersion = version
	q.UpdatedAt = time.Now().UTC()
	if version == documentv6.SchemaVersion {
		doc, parseErr := documentv6.Parse([]byte(input.Document))
		if parseErr != nil {
			return nil, &domain.ValidationError{Field: "document", Message: "document must be a valid supported document"}
		}
		company, companyErr := s.companyRepo.GetByID(txCtx, companyID)
		if companyErr != nil {
			return nil, companyErr
		}
		var customer *domain.Customer
		if q.CustomerID != "" {
			customer, err = s.customerRepo.GetByID(txCtx, q.CustomerID, companyID)
			if err != nil {
				return nil, err
			}
		}
		applyV6Totals(q, doc, company, customer)
	}

	if err := domain_quotation.ValidateQuotation(q); err != nil {
		return nil, err
	}

	if err := s.repo.Update(txCtx, q); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	value := mapToDTO(q)
	return &value, nil
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
	if q.SchemaVersion == documentv6.SchemaVersion {
		doc, parseErr := documentv6.Parse([]byte(q.Document))
		if parseErr != nil {
			return nil, &domain.ValidationError{Field: "document", Message: "document must be a valid supported document"}
		}
		company, companyErr := s.companyRepo.GetByID(txCtx, companyID)
		if companyErr != nil {
			return nil, companyErr
		}
		applyV6Totals(q, doc, company, cust)
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

func (s *Service) UpdateQuotationExpectedTotal(ctx context.Context, companyID string, input QuotationUpdateExpectedTotalDTO) (*QuotationDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()

	q, err := s.repo.GetByID(txCtx, input.ID, companyID)
	if err != nil {
		return nil, err
	}
	if q.Status != string(domain_quotation.StatusDraft) {
		return nil, ErrQuotationNotDraft
	}
	if input.ExpectedTotal != nil && *input.ExpectedTotal < 0 {
		return nil, &domain.ValidationError{Field: "expected_total", Message: "expected total cannot be negative"}
	}

	q.ExpectedTotal = input.ExpectedTotal
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

func (s *Service) GetQuotation(ctx context.Context, companyID, id string) (dto *QuotationDTO, err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		s.recorder.RecordOperation(ctx, "quotation.load", time.Since(started), result, nil)
	}()
	q, err := s.repo.GetByID(ctx, id, companyID)
	if err != nil {
		return nil, err
	}
	if q.CompanyID != companyID {
		return nil, domain.ErrNotFound
	}
	value := mapToDTO(q)
	dto = &value
	return dto, nil
}

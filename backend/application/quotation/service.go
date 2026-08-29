package quotation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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

	var doc *domain_quotation.Document
	if tmpl != nil {
		doc, err = s.resolver.Resolve(txCtx, tmpl)
	} else {
		doc = &domain_quotation.Document{Rows: []domain_quotation.Row{}}
	}
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
	doc, err := domain_quotation.ParseDocument(q.Document)
	if err != nil {
		return nil, fmt.Errorf("invalid quotation document: %w", err)
	}
	if doc.SchemaVersion >= 4 {
		// V4/V5 layouts are already complete document snapshots. Preserve them exactly;
		// flattening into the legacy rows envelope would lose geometry and layer order.
		layoutJSON := q.Document
		t := &domain.Template{ID: s.idGen.Generate(), CompanyID: &companyID, Name: name, Layout: layoutJSON, SchemaVersion: doc.SchemaVersion, CurrentVersion: 1, AuditMetadata: domain.AuditMetadata{CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(), Version: 1}}
		if err := s.templateRepo.Create(txCtx, t); err != nil {
			return nil, err
		}
		if err := s.templateRepo.CreateVersion(txCtx, &domain.TemplateVersion{ID: s.idGen.Generate(), TemplateID: t.ID, Version: 1, Layout: t.Layout, SchemaVersion: t.SchemaVersion, CreatedAt: t.CreatedAt}); err != nil {
			return nil, err
		}
		if err := s.txManager.Commit(txCtx); err != nil {
			return nil, err
		}
		return t, nil
	}
	if len(doc.Children) > 0 {
		layoutJSON, err := json.Marshal(map[string]interface{}{"schema_version": 1, "children": doc.Children})
		if err != nil {
			return nil, err
		}
		t := &domain.Template{ID: s.idGen.Generate(), CompanyID: &companyID, Name: name, Layout: string(layoutJSON), SchemaVersion: 1, CurrentVersion: 1, AuditMetadata: domain.AuditMetadata{CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(), Version: 1}}
		if err := s.templateRepo.Create(txCtx, t); err != nil {
			return nil, err
		}
		if err := s.templateRepo.CreateVersion(txCtx, &domain.TemplateVersion{ID: s.idGen.Generate(), TemplateID: t.ID, Version: 1, Layout: t.Layout, SchemaVersion: 1, CreatedAt: t.CreatedAt}); err != nil {
			return nil, err
		}
		if err := s.txManager.Commit(txCtx); err != nil {
			return nil, err
		}
		return t, nil
	}
	layout := make([]map[string]interface{}, 0, len(doc.Rows))
	for _, row := range doc.Rows {
		cols := make([]map[string]interface{}, 0, len(row.Columns))
		for _, col := range row.Columns {
			secs := make([]map[string]interface{}, 0, len(col.Sections))
			for _, sec := range col.Sections {
				secs = append(secs, map[string]interface{}{"id": sec.ID, "section_definition_id": sec.SectionDefinitionID, "visibility": sec.Visibility, "optional": sec.Optional})
			}
			cols = append(cols, map[string]interface{}{"id": col.ID, "order": col.Order, "width": col.Width, "sections": secs})
		}
		layout = append(layout, map[string]interface{}{"id": row.ID, "order": row.Order, "columns": cols})
	}
	layoutJSON, _ := json.Marshal(map[string]interface{}{"rows": layout})
	t := &domain.Template{ID: s.idGen.Generate(), CompanyID: &companyID, Name: name, Layout: string(layoutJSON), SchemaVersion: 1, CurrentVersion: 1, AuditMetadata: domain.AuditMetadata{CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(), Version: 1}}
	if err := s.templateRepo.Create(txCtx, t); err != nil {
		return nil, err
	}
	if err := s.templateRepo.CreateVersion(txCtx, &domain.TemplateVersion{ID: s.idGen.Generate(), TemplateID: t.ID, Version: 1, Layout: t.Layout, SchemaVersion: 1, CreatedAt: t.CreatedAt}); err != nil {
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

	version, err := domain_quotation.DocumentSchemaVersion(input.Document)
	if err != nil {
		return nil, &domain.ValidationError{Field: "document", Message: "invalid JSON document"}
	}
	if version > 4 {
		return nil, &domain.ValidationError{Field: "document", Message: "unsupported document schema version"}
	}
	q.Document = input.Document
	q.SchemaVersion = version
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

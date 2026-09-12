package template

import (
	"context"
	"errors"
	"time"

	appdiagnostics "quotierlabs/backend/application/diagnostics"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentformat"
	domain_template "quotierlabs/backend/domain/template"
)

var (
	ErrCannotModifyBuiltin = errors.New("cannot modify built-in template")
)

type Service struct {
	repo      domain.TemplateRepository
	txManager domain.TxManager
	idGen     domain.IDGenerator
	recorder  appdiagnostics.Recorder
}

func NewService(repo domain.TemplateRepository, txManager domain.TxManager, idGen domain.IDGenerator, recorders ...appdiagnostics.Recorder) *Service {
	recorder := appdiagnostics.Recorder(appdiagnostics.NopRecorder{})
	if len(recorders) > 0 && recorders[0] != nil {
		recorder = recorders[0]
	}
	return &Service{
		repo:      repo,
		txManager: txManager,
		idGen:     idGen,
		recorder:  recorder,
	}
}

func mapToDTO(t *domain.Template) TemplateDTO {
	return TemplateDTO{
		ID:             t.ID,
		CompanyID:      t.CompanyID,
		Name:           t.Name,
		Description:    t.Description,
		Layout:         t.Layout,
		SchemaVersion:  t.SchemaVersion,
		IsBuiltin:      t.IsBuiltin,
		CurrentVersion: t.CurrentVersion,
		CreatedAt:      t.CreatedAt,
		UpdatedAt:      t.UpdatedAt,
	}
}

func (s *Service) CreateTemplate(ctx context.Context, companyID string, input TemplateCreateDTO) (*TemplateDTO, error) {
	started := time.Now()
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()

	version, err := documentformat.Validate([]byte(input.Layout))
	if err != nil {
		return nil, &domain.ValidationError{Field: "layout", Message: "template layout is invalid"}
	}
	t := &domain.Template{
		ID:             s.idGen.Generate(),
		CompanyID:      &companyID,
		Name:           input.Name,
		Description:    input.Description,
		Layout:         input.Layout,
		SchemaVersion:  version,
		IsBuiltin:      false,
		CurrentVersion: 1,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
			Version:   1,
		},
	}

	if err := domain_template.ValidateTemplate(t); err != nil {
		return nil, err
	}

	if err := s.repo.Create(txCtx, t); err != nil {
		return nil, err
	}

	tv := &domain.TemplateVersion{
		ID:            s.idGen.Generate(),
		TemplateID:    t.ID,
		Version:       1,
		Layout:        t.Layout,
		SchemaVersion: t.SchemaVersion,
		CreatedAt:     t.CreatedAt,
	}
	if err := s.repo.CreateVersion(txCtx, tv); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	dto := mapToDTO(t)
	s.recorder.RecordOperation(ctx, "template.save", time.Since(started), "success", nil)
	return &dto, nil
}

func (s *Service) UpdateTemplate(ctx context.Context, companyID string, input TemplateUpdateDTO) (*TemplateDTO, error) {
	started := time.Now()
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()

	t, err := s.repo.GetByID(txCtx, input.ID)
	if err != nil {
		return nil, err
	}

	if t.IsBuiltin {
		return nil, ErrCannotModifyBuiltin
	}
	if t.CompanyID == nil || *t.CompanyID != companyID {
		return nil, domain.ErrNotFound
	}

	t.Name = input.Name
	t.Description = input.Description
	version, err := documentformat.Validate([]byte(input.Layout))
	if err != nil {
		return nil, &domain.ValidationError{Field: "layout", Message: "template layout is invalid"}
	}
	t.Layout = input.Layout
	t.SchemaVersion = version
	t.UpdatedAt = time.Now().UTC()
	t.CurrentVersion++

	if err := domain_template.ValidateTemplate(t); err != nil {
		return nil, err
	}

	if err := s.repo.Update(txCtx, t); err != nil {
		return nil, err
	}

	tv := &domain.TemplateVersion{
		ID:            s.idGen.Generate(),
		TemplateID:    t.ID,
		Version:       t.CurrentVersion,
		Layout:        t.Layout,
		SchemaVersion: t.SchemaVersion,
		CreatedAt:     t.UpdatedAt,
	}
	if err := s.repo.CreateVersion(txCtx, tv); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	dto := mapToDTO(t)
	s.recorder.RecordOperation(ctx, "template.save", time.Since(started), "success", nil)
	return &dto, nil
}

func (s *Service) DeleteTemplate(ctx context.Context, companyID, id string) error {
	t, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if t.IsBuiltin {
		return ErrCannotModifyBuiltin
	}
	if t.CompanyID == nil || *t.CompanyID != companyID {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id, companyID)
}

func (s *Service) GetTemplate(ctx context.Context, companyID, id string) (dto *TemplateDTO, err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		s.recorder.RecordOperation(ctx, "template.load", time.Since(started), result, nil)
	}()
	t, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !t.IsBuiltin && (t.CompanyID == nil || *t.CompanyID != companyID) {
		return nil, domain.ErrNotFound
	}
	value := mapToDTO(t)
	dto = &value
	return dto, nil
}

func (s *Service) ListTemplates(ctx context.Context, companyID string) (result []TemplateDTO, err error) {
	started := time.Now()
	defer func() {
		outcome := "success"
		if err != nil {
			outcome = "error"
		}
		s.recorder.RecordOperation(ctx, "template.load", time.Since(started), outcome, nil)
	}()
	builtins, err := s.repo.ListBuiltins(ctx)
	if err != nil {
		return nil, err
	}
	customs, err := s.repo.ListByCompany(ctx, companyID)
	if err != nil {
		return nil, err
	}

	result = make([]TemplateDTO, 0, len(builtins)+len(customs))
	for _, b := range builtins {
		result = append(result, mapToDTO(&b))
	}
	for _, c := range customs {
		result = append(result, mapToDTO(&c))
	}
	return result, nil
}

func (s *Service) DuplicateTemplate(ctx context.Context, companyID, sourceID string) (*TemplateDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()

	source, err := s.repo.GetByID(txCtx, sourceID)
	if err != nil {
		return nil, err
	}

	if !source.IsBuiltin && (source.CompanyID == nil || *source.CompanyID != companyID) {
		return nil, domain.ErrNotFound
	}

	clone := &domain.Template{
		ID:             s.idGen.Generate(),
		CompanyID:      &companyID,
		Name:           source.Name + " (Copy)",
		Description:    source.Description,
		Layout:         source.Layout,
		SchemaVersion:  source.SchemaVersion,
		IsBuiltin:      false,
		CurrentVersion: 1,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
			Version:   1,
		},
	}
	if err := domain_template.ValidateTemplate(clone); err != nil {
		return nil, err
	}

	if err := s.repo.Create(txCtx, clone); err != nil {
		return nil, err
	}

	tv := &domain.TemplateVersion{
		ID:            s.idGen.Generate(),
		TemplateID:    clone.ID,
		Version:       1,
		Layout:        clone.Layout,
		SchemaVersion: clone.SchemaVersion,
		CreatedAt:     clone.CreatedAt,
	}
	if err := s.repo.CreateVersion(txCtx, tv); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	dto := mapToDTO(clone)
	return &dto, nil
}

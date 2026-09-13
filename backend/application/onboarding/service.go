package onboarding

import (
	"context"
	"time"

	"quotierlabs/backend/application/company"
	"quotierlabs/backend/domain"
)

type Service struct {
	companyService *company.Service
	txManager      domain.TxManager
	templatesRepo  domain.TemplateRepository
	sequencesRepo  domain.NumberSequenceRepository
	idGen          domain.IDGenerator
}

func NewService(
	companyService *company.Service,
	txManager domain.TxManager,
	templatesRepo domain.TemplateRepository,
	sequencesRepo domain.NumberSequenceRepository,
	idGen domain.IDGenerator,
) *Service {
	return &Service{
		companyService: companyService,
		txManager:      txManager,
		templatesRepo:  templatesRepo,
		sequencesRepo:  sequencesRepo,
		idGen:          idGen,
	}
}

func (s *Service) CompleteOnboarding(ctx context.Context, input company.CompanyCreateDTO) error {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()

	comp, err := s.companyService.CreateCompany(txCtx, input)
	if err != nil {
		return err
	}

	// Seed default numbering sequence
	seq := &domain.NumberSequence{
		ID:           s.idGen.Generate(),
		CompanyID:    comp.ID,
		DocumentType: "QUOTATION",
		Prefix:       "QT",
		Pattern:      "{PREFIX}-{YYYY}-{0000}",
		CurrentValue: 0,
		Year:         time.Now().Year(),
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
			Version:   1,
		},
	}
	if err := s.sequencesRepo.Create(txCtx, seq); err != nil {
		return err
	}

	// Seed built-in templates
	builtinTmpls, err := s.templatesRepo.ListBuiltins(txCtx)
	if err != nil {
		return err
	}

	existingBuiltins := make(map[string]bool, len(builtinTmpls))
	for _, tmpl := range builtinTmpls {
		existingBuiltins[tmpl.Name] = true
	}
	for _, tmpl := range BuiltinTemplates {
		if existingBuiltins[tmpl.Name] {
			continue
		}
		newTmpl := tmpl
		newTmpl.ID = s.idGen.Generate()
		newTmpl.CreatedAt = time.Now().UTC()
		newTmpl.UpdatedAt = time.Now().UTC()
		newTmpl.Version = 1
		if err := s.templatesRepo.Create(txCtx, &newTmpl); err != nil {
			return err
		}

		tv := &domain.TemplateVersion{
			ID:            s.idGen.Generate(),
			TemplateID:    newTmpl.ID,
			Version:       newTmpl.CurrentVersion,
			Layout:        newTmpl.Layout,
			SchemaVersion: newTmpl.SchemaVersion,
			CreatedAt:     newTmpl.CreatedAt,
		}
		if err := s.templatesRepo.CreateVersion(txCtx, tv); err != nil {
			return err
		}
	}

	return s.txManager.Commit(txCtx)
}

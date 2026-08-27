package section

import (
	"context"
	"errors"
	"time"

	"quotierlabs/backend/domain"
	domain_section "quotierlabs/backend/domain/section"
)

var (
	ErrCannotModifyBuiltin = errors.New("cannot modify built-in section definition")
)

type Service struct {
	repo  domain.SectionDefinitionRepository
	idGen domain.IDGenerator
}

func NewService(repo domain.SectionDefinitionRepository, idGen domain.IDGenerator) *Service {
	return &Service{
		repo:  repo,
		idGen: idGen,
	}
}

func mapToDTO(s *domain.SectionDefinition) SectionDefinitionDTO {
	return SectionDefinitionDTO{
		ID:            s.ID,
		CompanyID:     s.CompanyID,
		Name:          s.Name,
		Description:   s.Description,
		Schema:        s.Schema,
		SchemaVersion: s.SchemaVersion,
		IsBuiltin:     s.IsBuiltin,
		Category:      s.Category,
		CreatedAt:     s.CreatedAt,
		UpdatedAt:     s.UpdatedAt,
	}
}

func (s *Service) CreateSectionDefinition(ctx context.Context, companyID string, input SectionCreateDTO) (*SectionDefinitionDTO, error) {
	def := &domain.SectionDefinition{
		ID:            s.idGen.Generate(),
		CompanyID:     &companyID,
		Name:          input.Name,
		Description:   input.Description,
		Schema:        input.Schema,
		SchemaVersion: 1, // Start with version 1
		IsBuiltin:     false,
		Category:      input.Category,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
			Version:   1,
		},
	}

	if err := domain_section.ValidateSectionDefinition(def); err != nil {
		return nil, err
	}

	if err := s.repo.Create(ctx, def); err != nil {
		return nil, err
	}

	dto := mapToDTO(def)
	return &dto, nil
}

func (s *Service) UpdateSectionDefinition(ctx context.Context, companyID string, input SectionUpdateDTO) (*SectionDefinitionDTO, error) {
	def, err := s.repo.GetByID(ctx, input.ID)
	if err != nil {
		return nil, err
	}

	if def.IsBuiltin {
		return nil, ErrCannotModifyBuiltin
	}
	if def.CompanyID == nil || *def.CompanyID != companyID {
		return nil, domain.ErrNotFound
	}

	def.Name = input.Name
	def.Description = input.Description
	def.Category = input.Category
	def.Schema = input.Schema
	def.UpdatedAt = time.Now().UTC()
	// SchemaVersion could be incremented here if schema genuinely evolved, but for MVP keep it simple.

	if err := domain_section.ValidateSectionDefinition(def); err != nil {
		return nil, err
	}

	if err := s.repo.Update(ctx, def); err != nil {
		return nil, err
	}

	dto := mapToDTO(def)
	return &dto, nil
}

func (s *Service) DeleteSectionDefinition(ctx context.Context, companyID, id string) error {
	def, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if def.IsBuiltin {
		return ErrCannotModifyBuiltin
	}
	if def.CompanyID == nil || *def.CompanyID != companyID {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id, companyID)
}

func (s *Service) GetSectionDefinition(ctx context.Context, companyID, id string) (*SectionDefinitionDTO, error) {
	def, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	// Check access
	if !def.IsBuiltin && (def.CompanyID == nil || *def.CompanyID != companyID) {
		return nil, domain.ErrNotFound
	}
	dto := mapToDTO(def)
	return &dto, nil
}

func (s *Service) ListSectionDefinitions(ctx context.Context, companyID string) ([]SectionDefinitionDTO, error) {
	builtins, err := s.repo.ListBuiltins(ctx)
	if err != nil {
		return nil, err
	}
	customs, err := s.repo.ListByCompany(ctx, companyID)
	if err != nil {
		return nil, err
	}

	result := make([]SectionDefinitionDTO, 0, len(builtins)+len(customs))
	for _, b := range builtins {
		result = append(result, mapToDTO(&b))
	}
	for _, c := range customs {
		result = append(result, mapToDTO(&c))
	}

	return result, nil
}

func (s *Service) CloneSectionDefinition(ctx context.Context, companyID, sourceID string) (*SectionDefinitionDTO, error) {
	source, err := s.repo.GetByID(ctx, sourceID)
	if err != nil {
		return nil, err
	}
	
	// Can clone builtins or own custom sections
	if !source.IsBuiltin && (source.CompanyID == nil || *source.CompanyID != companyID) {
		return nil, domain.ErrNotFound
	}

	clone := &domain.SectionDefinition{
		ID:            s.idGen.Generate(),
		CompanyID:     &companyID,
		Name:          source.Name + " (Clone)",
		Description:   source.Description,
		Category:      source.Category,
		Schema:        source.Schema,
		SchemaVersion: source.SchemaVersion,
		IsBuiltin:     false,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
			Version:   1,
		},
	}

	if err := s.repo.Create(ctx, clone); err != nil {
		return nil, err
	}

	dto := mapToDTO(clone)
	return &dto, nil
}

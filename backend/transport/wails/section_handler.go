package wails

import (
	"context"
	"fmt"

	"quotierlabs/backend/application/company"
	"quotierlabs/backend/application/section"
)

type SectionHandler struct {
	ctx            context.Context
	companyService *company.Service
	sectionSvc     *section.Service
}

func NewSectionHandler(
	companyService *company.Service,
	sectionSvc *section.Service,
) *SectionHandler {
	return &SectionHandler{
		companyService: companyService,
		sectionSvc:     sectionSvc,
	}
}

func (h *SectionHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

func (h *SectionHandler) getCompanyID() (string, error) {
	comp, err := h.companyService.GetActiveCompany(h.ctx)
	if err != nil {
		return "", fmt.Errorf("could not resolve active company: %v", err)
	}
	return comp.ID, nil
}

func (h *SectionHandler) CreateSectionDefinition(input section.SectionCreateDTO) (*section.SectionDefinitionDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.sectionSvc.CreateSectionDefinition(h.ctx, compID, input)
}

func (h *SectionHandler) UpdateSectionDefinition(input section.SectionUpdateDTO) (*section.SectionDefinitionDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.sectionSvc.UpdateSectionDefinition(h.ctx, compID, input)
}

func (h *SectionHandler) DeleteSectionDefinition(id string) error {
	compID, err := h.getCompanyID()
	if err != nil {
		return err
	}
	return h.sectionSvc.DeleteSectionDefinition(h.ctx, compID, id)
}

func (h *SectionHandler) ListSectionDefinitions() ([]section.SectionDefinitionDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.sectionSvc.ListSectionDefinitions(h.ctx, compID)
}

func (h *SectionHandler) CloneSectionDefinition(id string) (*section.SectionDefinitionDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.sectionSvc.CloneSectionDefinition(h.ctx, compID, id)
}

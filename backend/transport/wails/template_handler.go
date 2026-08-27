package wails

import (
	"context"
	"fmt"

	"quotierlabs/backend/application/company"
	"quotierlabs/backend/application/template"
)

type TemplateHandler struct {
	ctx            context.Context
	companyService *company.Service
	templateSvc    *template.Service
}

func NewTemplateHandler(
	companyService *company.Service,
	templateSvc *template.Service,
) *TemplateHandler {
	return &TemplateHandler{
		companyService: companyService,
		templateSvc:    templateSvc,
	}
}

func (h *TemplateHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

func (h *TemplateHandler) getCompanyID() (string, error) {
	comp, err := h.companyService.GetActiveCompany(h.ctx)
	if err != nil {
		return "", fmt.Errorf("could not resolve active company: %v", err)
	}
	return comp.ID, nil
}

func (h *TemplateHandler) CreateTemplate(input template.TemplateCreateDTO) (*template.TemplateDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.templateSvc.CreateTemplate(h.ctx, compID, input)
}

func (h *TemplateHandler) UpdateTemplate(input template.TemplateUpdateDTO) (*template.TemplateDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.templateSvc.UpdateTemplate(h.ctx, compID, input)
}

func (h *TemplateHandler) DeleteTemplate(id string) error {
	compID, err := h.getCompanyID()
	if err != nil {
		return err
	}
	return h.templateSvc.DeleteTemplate(h.ctx, compID, id)
}

func (h *TemplateHandler) GetTemplate(id string) (*template.TemplateDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.templateSvc.GetTemplate(h.ctx, compID, id)
}

func (h *TemplateHandler) ListTemplates() ([]template.TemplateDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.templateSvc.ListTemplates(h.ctx, compID)
}

func (h *TemplateHandler) DuplicateTemplate(id string) (*template.TemplateDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.templateSvc.DuplicateTemplate(h.ctx, compID, id)
}

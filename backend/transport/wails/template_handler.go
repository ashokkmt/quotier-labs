package wails

import (
	"context"
	"fmt"

	"quotierlabs/backend/application/company"
	"quotierlabs/backend/application/template"
	"quotierlabs/backend/domain/documentformat"
	appconfig "quotierlabs/backend/infrastructure/config"
)

type TemplateHandler struct {
	ctx            context.Context
	companyService *company.Service
	templateSvc    *template.Service
	preferences    *appconfig.Store
}

func NewTemplateHandler(
	companyService *company.Service,
	templateSvc *template.Service,
	preferences *appconfig.Store,
) *TemplateHandler {
	return &TemplateHandler{
		companyService: companyService,
		templateSvc:    templateSvc,
		preferences:    preferences,
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
	if err := h.requireV6CreationEnabled(input.Layout); err != nil {
		return nil, err
	}
	return h.templateSvc.CreateTemplate(h.ctx, compID, input)
}

func (h *TemplateHandler) UpdateTemplate(input template.TemplateUpdateDTO) (*template.TemplateDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	current, err := h.templateSvc.GetTemplate(h.ctx, compID, input.ID)
	if err != nil {
		return nil, err
	}
	if current.SchemaVersion != 6 {
		if err := h.requireV6CreationEnabled(input.Layout); err != nil {
			return nil, err
		}
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
	current, err := h.templateSvc.GetTemplate(h.ctx, compID, id)
	if err != nil {
		return nil, err
	}
	if current.SchemaVersion == 6 {
		if err := h.requireV6CreationEnabled(current.Layout); err != nil {
			return nil, err
		}
	}
	return h.templateSvc.DuplicateTemplate(h.ctx, compID, id)
}

func (h *TemplateHandler) requireV6CreationEnabled(layout string) error {
	version, err := documentformat.Version([]byte(layout))
	if err != nil || version != 6 {
		return nil // The application service returns validation errors for malformed layouts.
	}
	preferences, err := h.preferences.Load()
	if err != nil || !preferences.V6EditorEnabled {
		return fmt.Errorf("the V6 document editor is not enabled on this device")
	}
	return nil
}

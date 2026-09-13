package wails

import (
	"context"
	"fmt"

	"quotierlabs/backend/application/company"
	"quotierlabs/backend/application/quotation"
	"quotierlabs/backend/application/template"
	appconfig "quotierlabs/backend/infrastructure/config"
)

type QuotationHandler struct {
	ctx            context.Context
	companyService *company.Service
	quotationSvc   *quotation.Service
	templateSvc    *template.Service
	preferences    *appconfig.Store
}

func NewQuotationHandler(
	companyService *company.Service,
	quotationSvc *quotation.Service,
	templateSvc *template.Service,
	preferences *appconfig.Store,
) *QuotationHandler {
	return &QuotationHandler{
		companyService: companyService,
		quotationSvc:   quotationSvc,
		templateSvc:    templateSvc,
		preferences:    preferences,
	}
}

func (h *QuotationHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

func (h *QuotationHandler) getCompanyID() (string, error) {
	comp, err := h.companyService.GetActiveCompany(h.ctx)
	if err != nil {
		return "", fmt.Errorf("could not resolve active company: %v", err)
	}
	return comp.ID, nil
}

func (h *QuotationHandler) CreateQuotationDraft(input quotation.QuotationCreateDTO) (*quotation.QuotationDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	usesV6 := input.UseV6
	if input.TemplateID != "" {
		tmpl, templateErr := h.templateSvc.GetTemplate(h.ctx, compID, input.TemplateID)
		if templateErr != nil {
			return nil, templateErr
		}
		usesV6 = tmpl.SchemaVersion == 6
	}
	if usesV6 {
		preferences, err := h.preferences.Load()
		if err != nil || !preferences.V6EditorEnabled {
			return nil, fmt.Errorf("the V6 document editor is not enabled on this device")
		}
	}
	return h.quotationSvc.CreateQuotationDraft(h.ctx, compID, input)
}

func (h *QuotationHandler) SaveQuotationDocument(input quotation.QuotationUpdateDocumentDTO) (*quotation.QuotationDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.quotationSvc.UpdateQuotationDocument(h.ctx, compID, input)
}

func (h *QuotationHandler) UpdateQuotationCustomer(input quotation.QuotationUpdateCustomerDTO) (*quotation.QuotationDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.quotationSvc.UpdateQuotationCustomer(h.ctx, compID, input)
}

func (h *QuotationHandler) UpdateQuotationExpectedTotal(input quotation.QuotationUpdateExpectedTotalDTO) (*quotation.QuotationDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.quotationSvc.UpdateQuotationExpectedTotal(h.ctx, compID, input)
}

func (h *QuotationHandler) GetQuotation(id string) (*quotation.QuotationDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.quotationSvc.GetQuotation(h.ctx, compID, id)
}

func (h *QuotationHandler) RecalculateQuotation(id string) (*quotation.CalculationResultDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.quotationSvc.RecalculateQuotation(h.ctx, compID, id)
}

func (h *QuotationHandler) FinalizeQuotation(id string) (*quotation.QuotationDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.quotationSvc.FinalizeQuotation(h.ctx, compID, id)
}

func (h *QuotationHandler) UpdateQuotationStatus(id string, status string) (*quotation.QuotationDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.quotationSvc.UpdateQuotationStatus(h.ctx, compID, id, status)
}

func (h *QuotationHandler) DuplicateQuotation(id string) (*quotation.QuotationDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.quotationSvc.DuplicateQuotation(h.ctx, compID, id)
}

func (h *QuotationHandler) ListQuotations(filter quotation.QuotationListFilterDTO) (*quotation.QuotationListResponse, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.quotationSvc.ListQuotations(h.ctx, compID, filter)
}

func (h *QuotationHandler) DeleteQuotation(id string) error {
	compID, err := h.getCompanyID()
	if err != nil {
		return err
	}
	return h.quotationSvc.DeleteQuotation(h.ctx, compID, id)
}

func (h *QuotationHandler) SaveAsTemplate(input quotation.SaveAsTemplateDTO) (*template.TemplateDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	q, err := h.quotationSvc.GetQuotation(h.ctx, compID, input.QuotationID)
	if err != nil {
		return nil, err
	}
	if q.SchemaVersion == 6 {
		preferences, preferenceErr := h.preferences.Load()
		if preferenceErr != nil || !preferences.V6EditorEnabled {
			return nil, fmt.Errorf("the V6 document editor is not enabled on this device")
		}
	}
	t, err := h.quotationSvc.SaveAsTemplate(h.ctx, compID, input)
	if err != nil {
		return nil, err
	}
	return &template.TemplateDTO{ID: t.ID, CompanyID: t.CompanyID, Name: t.Name, Description: t.Description, Layout: t.Layout, SchemaVersion: t.SchemaVersion, IsBuiltin: t.IsBuiltin, CurrentVersion: t.CurrentVersion, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt}, nil
}

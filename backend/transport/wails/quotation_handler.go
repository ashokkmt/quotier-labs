package wails

import (
	"context"
	"fmt"

	"quotierlabs/backend/application/company"
	"quotierlabs/backend/application/quotation"
)

type QuotationHandler struct {
	ctx            context.Context
	companyService *company.Service
	quotationSvc   *quotation.Service
}

func NewQuotationHandler(
	companyService *company.Service,
	quotationSvc *quotation.Service,
) *QuotationHandler {
	return &QuotationHandler{
		companyService: companyService,
		quotationSvc:   quotationSvc,
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

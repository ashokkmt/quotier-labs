package wails

import (
	"context"
	"fmt"

	"quotierlabs/backend/application/company"
	"quotierlabs/backend/application/customer"
)

type CustomerHandler struct {
	ctx            context.Context
	companyService *company.Service
	customerSvc    *customer.Service
}

func NewCustomerHandler(
	companyService *company.Service,
	customerSvc *customer.Service,
) *CustomerHandler {
	return &CustomerHandler{
		companyService: companyService,
		customerSvc:    customerSvc,
	}
}

func (h *CustomerHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

func (h *CustomerHandler) getCompanyID() (string, error) {
	comp, err := h.companyService.GetActiveCompany(h.ctx)
	if err != nil {
		return "", fmt.Errorf("could not resolve active company: %v", err)
	}
	return comp.ID, nil
}

func (h *CustomerHandler) CreateCustomer(input customer.CustomerCreateDTO) (*customer.CustomerDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.customerSvc.CreateCustomer(h.ctx, compID, input)
}

func (h *CustomerHandler) UpdateCustomer(input customer.CustomerUpdateDTO) (*customer.CustomerDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.customerSvc.UpdateCustomer(h.ctx, compID, input)
}

func (h *CustomerHandler) DeleteCustomer(id string) error {
	compID, err := h.getCompanyID()
	if err != nil {
		return err
	}
	return h.customerSvc.DeleteCustomer(h.ctx, compID, id)
}

func (h *CustomerHandler) GetCustomer(id string) (*customer.CustomerDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.customerSvc.GetCustomer(h.ctx, compID, id)
}

func (h *CustomerHandler) ListCustomers(filter customer.CustomerListFilterDTO) (*customer.CustomerListDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.customerSvc.ListCustomers(h.ctx, compID, filter)
}

func (h *CustomerHandler) SearchCustomers(query string) ([]customer.CustomerDTO, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}
	return h.customerSvc.SearchCustomers(h.ctx, compID, query)
}

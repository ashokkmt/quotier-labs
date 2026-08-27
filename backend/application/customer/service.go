package customer

import (
	"context"
	"time"

	"quotierlabs/backend/domain"
	domain_customer "quotierlabs/backend/domain/customer"
)

type Service struct {
	repo  domain.CustomerRepository
	idGen domain.IDGenerator
}

func NewService(repo domain.CustomerRepository, idGen domain.IDGenerator) *Service {
	return &Service{
		repo:  repo,
		idGen: idGen,
	}
}

func mapToDTO(c *domain.Customer) CustomerDTO {
	return CustomerDTO{
		ID:              c.ID,
		Name:            c.Name,
		CompanyName:     c.CompanyName,
		ContactPerson:   c.ContactPerson,
		Address:         c.Address,
		Phone:           c.Phone,
		Email:           c.Email,
		GSTIN:           c.GSTIN,
		PAN:             c.PAN,
		State:           c.State,
		Country:         c.Country,
		BillingAddress:  c.BillingAddress,
		ShippingAddress: c.ShippingAddress,
		Notes:           c.Notes,
	}
}

func (s *Service) CreateCustomer(ctx context.Context, companyID string, input CustomerCreateDTO) (*CustomerDTO, error) {
	c := &domain.Customer{
		ID:              s.idGen.Generate(),
		CompanyID:       companyID,
		Name:            input.Name,
		CompanyName:     input.CompanyName,
		ContactPerson:   input.ContactPerson,
		Address:         input.Address,
		Phone:           input.Phone,
		Email:           input.Email,
		GSTIN:           input.GSTIN,
		PAN:             input.PAN,
		State:           input.State,
		Country:         input.Country,
		BillingAddress:  input.BillingAddress,
		ShippingAddress: input.ShippingAddress,
		Notes:           input.Notes,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
			Version:   1,
		},
	}

	if err := domain_customer.ValidateCustomer(c); err != nil {
		return nil, err
	}

	if err := s.repo.Create(ctx, c); err != nil {
		return nil, err
	}

	dto := mapToDTO(c)
	return &dto, nil
}

func (s *Service) UpdateCustomer(ctx context.Context, companyID string, input CustomerUpdateDTO) (*CustomerDTO, error) {
	c, err := s.repo.GetByID(ctx, input.ID, companyID)
	if err != nil {
		return nil, err
	}

	c.Name = input.Name
	c.CompanyName = input.CompanyName
	c.ContactPerson = input.ContactPerson
	c.Address = input.Address
	c.Phone = input.Phone
	c.Email = input.Email
	c.GSTIN = input.GSTIN
	c.PAN = input.PAN
	c.State = input.State
	c.Country = input.Country
	c.BillingAddress = input.BillingAddress
	c.ShippingAddress = input.ShippingAddress
	c.Notes = input.Notes
	c.UpdatedAt = time.Now().UTC()

	if err := domain_customer.ValidateCustomer(c); err != nil {
		return nil, err
	}

	if err := s.repo.Update(ctx, c); err != nil {
		return nil, err
	}

	dto := mapToDTO(c)
	return &dto, nil
}

func (s *Service) DeleteCustomer(ctx context.Context, companyID, customerID string) error {
	return s.repo.Delete(ctx, customerID, companyID)
}

func (s *Service) GetCustomer(ctx context.Context, companyID, customerID string) (*CustomerDTO, error) {
	c, err := s.repo.GetByID(ctx, customerID, companyID)
	if err != nil {
		return nil, err
	}

	dto := mapToDTO(c)
	return &dto, nil
}

func (s *Service) ListCustomers(ctx context.Context, companyID string, filter CustomerListFilterDTO) (*CustomerListDTO, error) {
	domainFilter := domain.CustomerListFilter{
		Limit:  filter.Limit,
		Offset: filter.Offset,
	}
	
	items, err := s.repo.List(ctx, companyID, domainFilter)
	if err != nil {
		return nil, err
	}

	dtoItems := make([]CustomerDTO, len(items))
	for i, c := range items {
		dtoItems[i] = mapToDTO(&c)
	}

	// Assuming a total is needed but SQLite repository didn't return a total count.
	// For MVP, we can return length. 
	// To do proper pagination, we'd add Count to repo, but for now length + offset is fine.
	return &CustomerListDTO{
		Items: dtoItems,
		Total: len(dtoItems) + filter.Offset,
	}, nil
}

func (s *Service) SearchCustomers(ctx context.Context, companyID, query string) ([]CustomerDTO, error) {
	items, err := s.repo.Search(ctx, companyID, query)
	if err != nil {
		return nil, err
	}

	dtoItems := make([]CustomerDTO, len(items))
	for i, c := range items {
		dtoItems[i] = mapToDTO(&c)
	}

	return dtoItems, nil
}

package company

import (
	"context"
	"time"

	"quotierlabs/backend/domain"
	domain_company "quotierlabs/backend/domain/company"
)

type Service struct {
	repo  domain.CompanyRepository
	idGen domain.IDGenerator
}

func NewService(repo domain.CompanyRepository, idGen domain.IDGenerator) *Service {
	return &Service{
		repo:  repo,
		idGen: idGen,
	}
}

func (s *Service) mapToDTO(c *domain.Company) *CompanyDTO {
	if c == nil {
		return nil
	}
	return &CompanyDTO{
		ID:           c.ID,
		Name:         c.Name,
		LegalName:    c.LegalName,
		TaxID:        c.TaxID,
		Address:      c.Address,
		Phone:        c.Phone,
		Email:        c.Email,
		Website:      c.Website,
		LogoURL:      c.LogoURL,
		State:        c.State,
		GSTIN:        c.GSTIN,
		PAN:          c.PAN,
		BankDetails:  c.BankDetails,
		SignatureURL: c.SignatureURL,
		StampURL:     c.StampURL,
		Currency:     c.Currency,
		IsActive:     c.IsActive,
	}
}

func (s *Service) GetActiveCompany(ctx context.Context) (*CompanyDTO, error) {
	comp, err := s.repo.GetActive(ctx)
	if err != nil {
		return nil, err
	}
	return s.mapToDTO(comp), nil
}

func (s *Service) CreateCompany(ctx context.Context, input CompanyCreateDTO) (*CompanyDTO, error) {
	comp := &domain.Company{
		ID:           s.idGen.Generate(),
		Name:         input.Name,
		LegalName:    input.LegalName,
		TaxID:        input.TaxID,
		Address:      input.Address,
		Phone:        input.Phone,
		Email:        input.Email,
		Website:      input.Website,
		LogoURL:      input.LogoURL,
		State:        input.State,
		GSTIN:        input.GSTIN,
		PAN:          input.PAN,
		BankDetails:  input.BankDetails,
		SignatureURL: input.SignatureURL,
		StampURL:     input.StampURL,
		Currency:     input.Currency,
		IsActive:     true,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
			Version:   1,
		},
	}

	if err := domain_company.ValidateCompany(comp); err != nil {
		return nil, err
	}

	if err := s.repo.Create(ctx, comp); err != nil {
		return nil, err
	}

	return s.mapToDTO(comp), nil
}

func (s *Service) UpdateCompany(ctx context.Context, input CompanyUpdateDTO) (*CompanyDTO, error) {
	comp, err := s.repo.GetByID(ctx, input.ID)
	if err != nil {
		return nil, err
	}

	comp.Name = input.Name
	comp.LegalName = input.LegalName
	comp.TaxID = input.TaxID
	comp.Address = input.Address
	comp.Phone = input.Phone
	comp.Email = input.Email
	comp.Website = input.Website
	comp.LogoURL = input.LogoURL
	comp.State = input.State
	comp.GSTIN = input.GSTIN
	comp.PAN = input.PAN
	comp.BankDetails = input.BankDetails
	comp.SignatureURL = input.SignatureURL
	comp.StampURL = input.StampURL
	comp.Currency = input.Currency
	comp.UpdatedAt = time.Now().UTC()

	if err := domain_company.ValidateCompany(comp); err != nil {
		return nil, err
	}

	if err := s.repo.Update(ctx, comp); err != nil {
		return nil, err
	}

	return s.mapToDTO(comp), nil
}

func (s *Service) IsFirstRun(ctx context.Context) (bool, error) {
	_, err := s.repo.GetActive(ctx)
	if err != nil {
		if err == domain.ErrNotFound {
			return true, nil
		}
		return false, err
	}
	return false, nil
}

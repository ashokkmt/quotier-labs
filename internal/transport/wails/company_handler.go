package wails

import (
	"context"

	"quotierlabs/internal/application/company"
	"quotierlabs/internal/application/onboarding"
	"quotierlabs/internal/infrastructure/apppaths"
)

type CompanyHandler struct {
	ctx               context.Context
	companyService    *company.Service
	onboardingService *onboarding.Service
	paths             apppaths.Paths
}

func NewCompanyHandler(
	companyService *company.Service,
	onboardingService *onboarding.Service,
	paths apppaths.Paths,
) *CompanyHandler {
	return &CompanyHandler{
		companyService:    companyService,
		onboardingService: onboardingService,
		paths:             paths,
	}
}

func (h *CompanyHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

func (h *CompanyHandler) IsFirstRun() (bool, error) {
	return h.companyService.IsFirstRun(h.ctx)
}

func (h *CompanyHandler) GetActiveCompany() (*company.CompanyDTO, error) {
	return h.companyService.GetActiveCompany(h.ctx)
}

func (h *CompanyHandler) CreateCompany(input company.CompanyCreateDTO) (*company.CompanyDTO, error) {
	return h.companyService.CreateCompany(h.ctx, input)
}

func (h *CompanyHandler) UpdateCompany(input company.CompanyUpdateDTO) (*company.CompanyDTO, error) {
	return h.companyService.UpdateCompany(h.ctx, input)
}

func (h *CompanyHandler) CompleteOnboarding(input company.CompanyCreateDTO) error {
	return h.onboardingService.CompleteOnboarding(h.ctx, input)
}

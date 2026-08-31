package domain

import (
	"context"
	"time"
)

type TxManager interface {
	BeginTx(ctx context.Context) (context.Context, error)
	Commit(ctx context.Context) error
	Rollback(ctx context.Context) error
}

type CompanyRepository interface {
	Create(ctx context.Context, company *Company) error
	Update(ctx context.Context, company *Company) error
	GetActive(ctx context.Context) (*Company, error)
	GetByID(ctx context.Context, id string) (*Company, error)
}

type CustomerListFilter struct {
	Limit  int
	Offset int
}

type CustomerRepository interface {
	Create(ctx context.Context, customer *Customer) error
	Update(ctx context.Context, customer *Customer) error
	Delete(ctx context.Context, id, companyID string) error
	GetByID(ctx context.Context, id, companyID string) (*Customer, error)
	List(ctx context.Context, companyID string, filter CustomerListFilter) ([]Customer, error)
	Search(ctx context.Context, companyID, query string) ([]Customer, error)
}

type TemplateRepository interface {
	Create(ctx context.Context, template *Template) error
	Update(ctx context.Context, template *Template) error
	Delete(ctx context.Context, id, companyID string) error
	GetByID(ctx context.Context, id string) (*Template, error)
	ListByCompany(ctx context.Context, companyID string) ([]Template, error)
	ListBuiltins(ctx context.Context) ([]Template, error)
	CreateVersion(ctx context.Context, version *TemplateVersion) error
}

type QuotationListFilter struct {
	Limit      int
	Offset     int
	Status     *string
	CustomerID *string
	TemplateID *string
	Search     *string
	StartDate  *time.Time
	EndDate    *time.Time
	SortBy     *string
	SortDesc   bool
}

type QuotationRepository interface {
	Create(ctx context.Context, quotation *Quotation) error
	Update(ctx context.Context, quotation *Quotation) error
	GetByID(ctx context.Context, id, companyID string) (*Quotation, error)
	List(ctx context.Context, companyID string, filter QuotationListFilter) ([]Quotation, error)
	Count(ctx context.Context, companyID string, filter QuotationListFilter) (int, error)
	Delete(ctx context.Context, id, companyID string) error
}

type NumberSequenceRepository interface {
	ReserveNext(ctx context.Context, companyID, documentType string, year int) (int, error)
	Create(ctx context.Context, sequence *NumberSequence) error

	GetCurrent(ctx context.Context, companyID, documentType string, year int) (*NumberSequence, error)
}

type SettingsRepository interface {
	Get(ctx context.Context, companyID string, key string) (*Settings, error)
	Set(ctx context.Context, setting *Settings) error
}

//go:build wireinject
// +build wireinject

package di

import (
	"github.com/google/wire"
	"go.uber.org/zap"
	"gorm.io/gorm"
	
	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/id"
	"quotierlabs/backend/infrastructure/logging"
	"quotierlabs/backend/infrastructure/sqlite"
	"quotierlabs/backend/application/company"
	"quotierlabs/backend/application/customer"
	"quotierlabs/backend/application/onboarding"
	"quotierlabs/backend/transport/wails"
)

func ProvideDB() (*gorm.DB, error) {
	return sqlite.NewDB("quotierlabs.db")
}

var InfrastructureSet = wire.NewSet(
	id.NewULIDGenerator,
	logging.NewLogger,
	ProvideDB,
	sqlite.NewGormTxManager,
	sqlite.NewCompanyRepository,
	sqlite.NewCustomerRepository,
	sqlite.NewSectionDefinitionRepository,
	sqlite.NewTemplateRepository,
	sqlite.NewQuotationRepository,
	sqlite.NewNumberSequenceRepository,
)

var ApplicationSet = wire.NewSet(
	company.NewService,
	onboarding.NewService,
	customer.NewService,
)

var TransportSet = wire.NewSet(
	wails.NewCompanyHandler,
	wails.NewCustomerHandler,
)

type App struct {
	Logger       *zap.Logger
	IDGenerator  domain.IDGenerator
	TxManager    domain.TxManager
	Companies    domain.CompanyRepository
	Customers    domain.CustomerRepository
	Sections     domain.SectionDefinitionRepository
	Templates    domain.TemplateRepository
	Quotations   domain.QuotationRepository
	Sequences    domain.NumberSequenceRepository
	
	CompanyService *company.Service
	OnboardService *onboarding.Service
	CompanyHandler *wails.CompanyHandler
	CustomerHandler *wails.CustomerHandler
}

func InitializeApp() (*App, error) {
	wire.Build(
		InfrastructureSet,
		ApplicationSet,
		TransportSet,
		wire.Struct(new(App), "*"),
	)
	return nil, nil
}

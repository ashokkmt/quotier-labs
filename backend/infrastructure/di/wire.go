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
}

func InitializeApp() (*App, error) {
	wire.Build(
		InfrastructureSet,
		wire.Struct(new(App), "*"),
	)
	return nil, nil
}

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
	"quotierlabs/backend/application/section"
	"quotierlabs/backend/application/template"
	"quotierlabs/backend/application/quotation"
	domain_quotation "quotierlabs/backend/domain/quotation"
	"quotierlabs/backend/application/onboarding"
	"quotierlabs/backend/transport/wails"
	"quotierlabs/backend/application/document"
	"quotierlabs/backend/infrastructure/pdf"
	os_infra "quotierlabs/backend/infrastructure/os"
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
	pdf.NewGenerator,
	os_infra.NewPrintService,
	os_infra.NewShareService,
	wire.Bind(new(document.PrintService), new(*os_infra.PrintService)),
	wire.Bind(new(document.ShareService), new(*os_infra.ShareService)),
)

var ApplicationSet = wire.NewSet(
	company.NewService,
	onboarding.NewService,
	customer.NewService,
	section.NewService,
	template.NewService,
	quotation.NewService,
	domain_quotation.NewTemplateResolver,
	document.NewService,
	document.NewExportService,
)

var TransportSet = wire.NewSet(
	wails.NewCompanyHandler,
	wails.NewCustomerHandler,
	wails.NewSectionHandler,
	wails.NewTemplateHandler,
	wails.NewQuotationHandler,
	wails.NewDocumentHandler,
	wails.NewExportHandler,
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
	SectionHandler *wails.SectionHandler
	TemplateHandler *wails.TemplateHandler
	QuotationHandler *wails.QuotationHandler
	DocumentHandler *wails.DocumentHandler
	ExportHandler *wails.ExportHandler
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

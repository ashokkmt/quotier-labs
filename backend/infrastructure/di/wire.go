//go:build wireinject
// +build wireinject

package di

import (
	"github.com/google/wire"
	"go.uber.org/zap"
	"gorm.io/gorm"

	backup_app "quotierlabs/backend/application/backup"
	"quotierlabs/backend/application/company"
	"quotierlabs/backend/application/customer"
	"quotierlabs/backend/application/document"
	"quotierlabs/backend/application/onboarding"
	"quotierlabs/backend/application/quotation"
	"quotierlabs/backend/application/template"
	update_app "quotierlabs/backend/application/update"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
	backup_infra "quotierlabs/backend/infrastructure/backup"
	appconfig "quotierlabs/backend/infrastructure/config"
	"quotierlabs/backend/infrastructure/diagnostics"
	"quotierlabs/backend/infrastructure/export"
	"quotierlabs/backend/infrastructure/id"
	csvimport "quotierlabs/backend/infrastructure/import"
	"quotierlabs/backend/infrastructure/legacydata"
	"quotierlabs/backend/infrastructure/logging"
	os_infra "quotierlabs/backend/infrastructure/os"
	"quotierlabs/backend/infrastructure/pdf"
	"quotierlabs/backend/infrastructure/recovery"
	"quotierlabs/backend/infrastructure/sqlite"
	"quotierlabs/backend/transport/wails"
)

func ProvideDB(paths apppaths.Paths) (*gorm.DB, error) {
	return sqlite.NewDB(paths.DBPath())
}

func ProvideCurrentDBPath(paths apppaths.Paths) string {
	return paths.DBPath()
}

func ProvideSchemaVersion() (int64, error) { return sqlite.TargetSchemaVersion() }

func ProvidePreferences(paths apppaths.Paths) *appconfig.Store {
	return appconfig.NewStore(paths.SettingsPath())
}
func ProvideRecovery(paths apppaths.Paths) *recovery.Store {
	return recovery.NewStore(paths.RecoveryRoot())
}

var InfrastructureSet = wire.NewSet(
	id.NewULIDGenerator,
	logging.NewLogger,
	diagnostics.NewManager,
	ProvidePreferences,
	ProvideRecovery,
	ProvideDB,
	ProvideCurrentDBPath,
	ProvideSchemaVersion,
	legacydata.NewService,
	sqlite.NewGormTxManager,
	sqlite.NewCompanyRepository,
	sqlite.NewCustomerRepository,
	sqlite.NewTemplateRepository,
	sqlite.NewQuotationRepository,
	sqlite.NewNumberSequenceRepository,
	sqlite.NewSettingsRepository,
	pdf.NewGenerator,
	pdf.NewLayoutMetrics,
	os_infra.NewPrintService,
	os_infra.NewShareService,
	backup_infra.NewSQLiteBackupService,
	wire.Bind(new(backup_app.BackupRepo), new(*backup_infra.SQLiteBackupService)),
	export.NewCSVExportService,
	csvimport.NewCSVImportService,
	wire.Bind(new(document.PrintService), new(*os_infra.PrintService)),
	wire.Bind(new(document.ShareService), new(*os_infra.ShareService)),
)

var ApplicationSet = wire.NewSet(
	company.NewService,
	onboarding.NewService,
	customer.NewService,
	template.NewService,
	quotation.NewService,
	document.NewService,
	document.NewExportService,
	backup_app.NewService,
	backup_app.NewAutoBackupManager,
	update_app.NewService,
)

var TransportSet = wire.NewSet(
	wails.NewAppHandler,
	wails.NewDiagnosticsHandler,
	wails.NewCompanyHandler,
	wails.NewCustomerHandler,
	wails.NewTemplateHandler,
	wails.NewQuotationHandler,
	wails.NewDocumentHandler,
	wails.NewExportHandler,
	wails.NewBackupHandler,
	wails.NewUpdateHandler,
	wails.NewLegacyHandler,
)

type App struct {
	Logger      *zap.Logger
	IDGenerator domain.IDGenerator
	TxManager   domain.TxManager
	Companies   domain.CompanyRepository
	Customers   domain.CustomerRepository
	Templates   domain.TemplateRepository
	Quotations  domain.QuotationRepository
	Sequences   domain.NumberSequenceRepository

	CompanyService     *company.Service
	OnboardService     *onboarding.Service
	AppHandler         *wails.AppHandler
	Diagnostics        *diagnostics.Manager
	DiagnosticsHandler *wails.DiagnosticsHandler
	CompanyHandler     *wails.CompanyHandler
	CustomerHandler    *wails.CustomerHandler
	TemplateHandler    *wails.TemplateHandler
	QuotationHandler   *wails.QuotationHandler
	DocumentHandler    *wails.DocumentHandler
	ExportHandler      *wails.ExportHandler
	BackupHandler      *wails.BackupHandler
	AutoBackup         *backup_app.AutoBackupManager
	UpdateHandler      *wails.UpdateHandler
	LegacyHandler      *wails.LegacyHandler
	DB                 *gorm.DB
	Paths              apppaths.Paths
	Build              appidentity.BuildInfo
}

func InitializeApp(paths apppaths.Paths, build appidentity.BuildInfo) (*App, error) {
	wire.Build(
		InfrastructureSet,
		ApplicationSet,
		TransportSet,
		wire.Struct(new(App), "*"),
	)
	return nil, nil
}

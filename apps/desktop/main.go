package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	winoptions "github.com/wailsapp/wails/v2/pkg/options/windows"
	"go.uber.org/zap"
	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
	"quotierlabs/backend/infrastructure/di"
	"quotierlabs/backend/infrastructure/lifecycle"
	"quotierlabs/frontend"
)

type DesktopApp struct {
	ctx   context.Context
	diApp *di.App
}

func NewDesktopApp(diApp *di.App) *DesktopApp {
	return &DesktopApp{
		diApp: diApp,
	}
}

func (a *DesktopApp) startup(ctx context.Context) {
	a.ctx = ctx
	a.diApp.Logger.Info("Quotier Labs Desktop App Started")

	// Start Wails handlers
	a.diApp.AppHandler.Startup(ctx)
	a.diApp.CompanyHandler.Startup(ctx)
	a.diApp.CustomerHandler.Startup(ctx)
	a.diApp.TemplateHandler.Startup(ctx)
	a.diApp.QuotationHandler.Startup(ctx)
	a.diApp.DocumentHandler.Startup(ctx)
	a.diApp.ExportHandler.Startup(ctx)
	a.diApp.BackupHandler.Startup(ctx)
	a.diApp.UpdateHandler.Startup(ctx)
	a.diApp.LegacyHandler.Startup(ctx)

	a.diApp.AutoBackup.Start()
	lifecycle.MarkHealthy(a.diApp.Paths, a.diApp.Build)
}

func (a *DesktopApp) shutdown(ctx context.Context) {
	if a.diApp.AutoBackup != nil {
		a.diApp.AutoBackup.Stop()
	}
	if a.diApp.DB != nil {
		if sqlDB, err := a.diApp.DB.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}
	_ = os.RemoveAll(a.diApp.Paths.TempRoot)
}

func main() {
	build := appidentity.Current()
	paths, err := apppaths.Resolve(apppaths.Options{Build: build})
	if err != nil {
		log.Fatalf("Quotier Labs could not prepare its application data: %v", err)
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			lifecycle.RecordPanic(paths, build, "main", recovered)
			fmt.Fprintf(os.Stderr, "Quotier Labs stopped unexpectedly. A local crash report was saved.\n")
			os.Exit(2)
		}
	}()
	lifecycle.CleanupTemp(paths)
	lifecycle.CleanupDiagnostics(paths)
	instance, err := lifecycle.AcquireInstanceLock(paths)
	if err != nil {
		log.Print(err)
		return
	}
	defer instance.Close()
	if err := lifecycle.ValidatePendingUpdate(paths, build); err != nil {
		lifecycle.RecordPanic(paths, build, "update-transaction-validation", err)
		log.Fatalf("could not validate the pending application update: %v", err)
	}

	diApp, err := di.InitializeApp(paths, build)
	if err != nil {
		lifecycle.RecordPanic(paths, build, "dependency-initialization", err)
		log.Fatalf("failed to initialize dependencies: %v", err)
	}
	defer func() { _ = diApp.Logger.Sync() }()
	diApp.Logger.Info("application initialized", zap.String("data_class", "resolved"))

	app := NewDesktopApp(diApp)

	err = wails.Run(&options.App{
		Title:  build.Name,
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: frontend.Assets,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Windows: &winoptions.Options{
			WebviewUserDataPath: paths.WebViewRoot,
			Theme:               winoptions.SystemDefault,
		},
		Bind: []interface{}{
			app,
			diApp.AppHandler,
			diApp.CompanyHandler,
			diApp.CustomerHandler,
			diApp.TemplateHandler,
			diApp.QuotationHandler,
			diApp.DocumentHandler,
			diApp.ExportHandler,
			diApp.BackupHandler,
			diApp.UpdateHandler,
			diApp.LegacyHandler,
		},
	})

	if err != nil {
		lifecycle.RecordPanic(paths, build, "wails-runtime", err)
		diApp.Logger.Error("desktop runtime stopped unexpectedly")
		_ = diApp.Logger.Sync()
		os.Exit(1)
	}
}

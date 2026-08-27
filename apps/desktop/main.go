package main

import (
	"context"
	
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"quotierlabs/backend/infrastructure/di"
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
	a.diApp.CompanyHandler.Startup(ctx)
	a.diApp.CustomerHandler.Startup(ctx)
	a.diApp.SectionHandler.Startup(ctx)
	a.diApp.TemplateHandler.Startup(ctx)
	a.diApp.QuotationHandler.Startup(ctx)
	a.diApp.DocumentHandler.Startup(ctx)
	a.diApp.ExportHandler.Startup(ctx)
}

func main() {
	diApp, err := di.InitializeApp()
	if err != nil {
		log.Fatalf("failed to initialize dependencies: %v", err)
	}
	defer func() { _ = diApp.Logger.Sync() }()

	app := NewDesktopApp(diApp)

	err = wails.Run(&options.App{
		Title:  "Quotier Labs",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: frontend.Assets,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
			diApp.CompanyHandler,
			diApp.CustomerHandler,
			diApp.SectionHandler,
			diApp.TemplateHandler,
			diApp.QuotationHandler,
			diApp.DocumentHandler,
			diApp.ExportHandler,
		},
	})

	if err != nil {
		log.Fatal(err)
	}
}

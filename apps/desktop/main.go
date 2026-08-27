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




// DesktopApp struct
type DesktopApp struct {
	ctx   context.Context
	diApp *di.App
}

// NewDesktopApp creates a new App application struct
func NewDesktopApp(diApp *di.App) *DesktopApp {
	return &DesktopApp{
		diApp: diApp,
	}
}

func (a *DesktopApp) startup(ctx context.Context) {
	a.ctx = ctx
	a.diApp.Logger.Info("Quotier Labs Desktop App Started")
}

func main() {
	// Initialize DI
	diApp, err := di.InitializeApp()
	if err != nil {
		log.Fatalf("failed to initialize dependencies: %v", err)
	}
	defer func() { _ = diApp.Logger.Sync() }()

	app := NewDesktopApp(diApp)

	// Create application with options
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
		},
	})

	if err != nil {
		log.Fatal(err)
	}
}

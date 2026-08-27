//go:build wireinject
// +build wireinject

package di

import (
	"github.com/google/wire"
	"go.uber.org/zap"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/id"
	"quotierlabs/backend/infrastructure/logging"
)

// InfrastructureSet provides all infrastructure dependencies
var InfrastructureSet = wire.NewSet(
	id.NewULIDGenerator,
	logging.NewLogger,
)

// App represents the DI composition root.
type App struct {
	Logger *zap.Logger
	IDGen  domain.IDGenerator
}

func InitializeApp() (*App, error) {
	wire.Build(
		InfrastructureSet,
		wire.Struct(new(App), "*"),
	)
	return &App{}, nil
}

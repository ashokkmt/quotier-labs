package wails

import (
	"context"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"quotierlabs/backend/infrastructure/legacydata"
)

type LegacyHandler struct {
	service *legacydata.Service
	ctx     context.Context
}

func NewLegacyHandler(service *legacydata.Service) *LegacyHandler {
	return &LegacyHandler{service: service}
}
func (h *LegacyHandler) Startup(ctx context.Context) { h.ctx = ctx }
func (h *LegacyHandler) DiscoverLegacyData() ([]legacydata.Candidate, error) {
	return h.service.Discover(h.ctx)
}
func (h *LegacyHandler) ImportLegacyData(path string) error {
	if err := h.service.Import(h.ctx, path); err != nil {
		return err
	}
	wailsRuntime.Quit(h.ctx)
	return nil
}
func (h *LegacyHandler) SkipLegacyData() error { return h.service.Skip() }

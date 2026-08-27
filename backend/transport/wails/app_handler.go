package wails

import (
	"context"
)

type AppHandler struct {
	ctx context.Context
}

func NewAppHandler() *AppHandler {
	return &AppHandler{}
}

func (h *AppHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

type AppInfo struct {
	Version string `json:"version"`
	Name    string `json:"name"`
	OS      string `json:"os"`
}

func (h *AppHandler) GetAppInfo() AppInfo {
	return AppInfo{
		Version: "1.0.0", // Hardcoded for MVP release
		Name:    "Quotier Labs",
		OS:      "darwin/windows/linux",
	}
}

package wails

import (
	"context"
	"errors"
	"path/filepath"
	"sync"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	backupapp "quotierlabs/backend/application/backup"
	updateapp "quotierlabs/backend/application/update"
	"quotierlabs/backend/infrastructure/apppaths"
)

type UpdateHandler struct {
	service *updateapp.Service
	backup  *backupapp.Service
	auto    *backupapp.AutoBackupManager
	paths   apppaths.Paths
	ctx     context.Context
	mu      sync.Mutex
	cancel  context.CancelFunc
}

func NewUpdateHandler(service *updateapp.Service, backup *backupapp.Service, auto *backupapp.AutoBackupManager, paths apppaths.Paths) *UpdateHandler {
	return &UpdateHandler{service: service, backup: backup, auto: auto, paths: paths}
}

func (h *UpdateHandler) Startup(ctx context.Context) { h.ctx = ctx }

func (h *UpdateHandler) CheckForUpdates() (updateapp.CheckResult, error) {
	return h.service.Check(h.ctx)
}

func (h *UpdateHandler) DownloadUpdate() (string, error) {
	h.mu.Lock()
	if h.cancel != nil {
		h.mu.Unlock()
		return "", errors.New("an update download is already running")
	}
	ctx, cancel := context.WithCancel(h.ctx)
	h.cancel = cancel
	h.mu.Unlock()
	defer func() { h.mu.Lock(); h.cancel = nil; h.mu.Unlock() }()
	return h.service.Download(ctx, func(progress updateapp.Progress) {
		wailsRuntime.EventsEmit(h.ctx, "update-progress", progress)
	})
}

func (h *UpdateHandler) CancelUpdateDownload() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.cancel != nil {
		h.cancel()
	}
}

func (h *UpdateHandler) InstallUpdate() error {
	h.auto.Stop()
	// A verified rollback backup is a hard precondition for replacing application code.
	if _, err := h.backup.CreateBackup(h.ctx, filepath.Join(h.paths.StateRoot, "update-backups")); err != nil {
		h.auto.Start()
		return errors.New("could not create the required pre-update backup; verify available disk space and try again")
	}
	if err := h.service.StartInstaller(); err != nil {
		h.auto.Start()
		return err
	}
	wailsRuntime.Quit(h.ctx)
	return nil
}

func (h *UpdateHandler) SkipUpdateVersion() error { return h.service.SkipCurrentVersion() }

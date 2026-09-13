package wails

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	appconfig "quotierlabs/backend/infrastructure/config"
	"quotierlabs/backend/infrastructure/diagnostics"
	"quotierlabs/backend/infrastructure/fileutil"
)

// DiagnosticsHandler is intentionally narrow: the policy and all persistence
// remain in the diagnostics manager, never in the WebView.
type DiagnosticsHandler struct {
	ctx         context.Context
	manager     *diagnostics.Manager
	preferences *appconfig.Store
}

func NewDiagnosticsHandler(manager *diagnostics.Manager, preferences *appconfig.Store) *DiagnosticsHandler {
	return &DiagnosticsHandler{manager: manager, preferences: preferences}
}
func (h *DiagnosticsHandler) Startup(ctx context.Context)              { h.ctx = ctx }
func (h *DiagnosticsHandler) GetDiagnosticsStatus() diagnostics.Status { return h.manager.Status() }
func (h *DiagnosticsHandler) StartDiagnosticsRecording(scenario string) (diagnostics.Status, error) {
	return h.manager.Start(scenario)
}
func (h *DiagnosticsHandler) StopDiagnosticsRecording() (diagnostics.Status, error) {
	return h.manager.Stop()
}
func (h *DiagnosticsHandler) CaptureDiagnosticsProfile(kind string) (string, error) {
	return h.manager.CaptureProfile(kind)
}
func (h *DiagnosticsHandler) OpenDiagnosticsFolder() error { return h.manager.OpenRoot() }
func (h *DiagnosticsHandler) RecordFrontendDiagnostics(name string, durationMS float64, dimensions map[string]int64) {
	if durationMS < 0 || durationMS > 60_000 {
		return
	}
	h.manager.RecordFrontend(h.ctx, name, time.Duration(durationMS*float64(time.Millisecond)), dimensions)
}
func (h *DiagnosticsHandler) RecordDiagnosticsOperation(name string, durationMS float64, result string, dimensions map[string]int64) {
	if durationMS < 0 || durationMS > 60_000 {
		return
	}
	h.manager.RecordOperation(h.ctx, name, time.Duration(durationMS*float64(time.Millisecond)), result, dimensions)
}

// ExportDiagnosticsRecording uses the native Save dialog and creates an atomic
// local archive. The manager rejects traversal and archives only one selected
// recording; regular support export remains in AppHandler.
func (h *DiagnosticsHandler) ExportDiagnosticsRecording(sessionID string) (string, error) {
	if sessionID == "" {
		return "", fmt.Errorf("select a completed diagnostic recording")
	}
	destination, err := wailsRuntime.SaveFileDialog(h.ctx, wailsRuntime.SaveDialogOptions{Title: "Export diagnostic recording", DefaultFilename: "quotier-labs-recording.zip", Filters: []wailsRuntime.FileFilter{{DisplayName: "ZIP archive", Pattern: "*.zip"}}})
	if err != nil || destination == "" {
		return "", err
	}
	tmp, err := os.CreateTemp(filepath.Dir(destination), ".diagnostic-recording-*.partial")
	if err != nil {
		return "", err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	_ = tmp.Chmod(0600)
	preferences, preferenceErr := h.preferences.Load()
	if preferenceErr != nil {
		return "", fmt.Errorf("load diagnostic capability flags: %w", preferenceErr)
	}
	if err := h.manager.ArchiveSession(sessionID, tmp, diagnostics.SupportOptions{V6EditorEnabled: preferences.V6EditorEnabled}); err != nil {
		_ = tmp.Close()
		return "", err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := fileutil.Replace(tmpName, destination); err != nil {
		return "", fmt.Errorf("save diagnostic recording: %w", err)
	}
	return destination, nil
}

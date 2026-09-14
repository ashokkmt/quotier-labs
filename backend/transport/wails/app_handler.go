package wails

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
	appconfig "quotierlabs/backend/infrastructure/config"
	"quotierlabs/backend/infrastructure/fileutil"
	"quotierlabs/backend/infrastructure/recovery"
)

type AppHandler struct {
	ctx         context.Context
	build       appidentity.BuildInfo
	paths       apppaths.Paths
	preferences *appconfig.Store
	recovery    *recovery.Store
}

func NewAppHandler(build appidentity.BuildInfo, paths apppaths.Paths, preferences *appconfig.Store, recoveryStore *recovery.Store) *AppHandler {
	return &AppHandler{build: build, paths: paths, preferences: preferences, recovery: recoveryStore}
}

func (h *AppHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

type AppInfo struct {
	Version        string `json:"version"`
	Name           string `json:"name"`
	OS             string `json:"os"`
	Arch           string `json:"arch"`
	Channel        string `json:"channel"`
	Commit         string `json:"commit"`
	BuildTime      string `json:"build_time"`
	UpdatesEnabled bool   `json:"updates_enabled"`
	ManualUpdates  bool   `json:"manual_updates_enabled"`
}

func (h *AppHandler) GetAppInfo() AppInfo {
	return AppInfo{
		Version:        h.build.Version,
		Name:           h.build.Name,
		OS:             h.build.OS,
		Arch:           h.build.Arch,
		Channel:        h.build.Channel,
		Commit:         h.build.GitCommit,
		BuildTime:      h.build.BuildTime,
		UpdatesEnabled: h.build.UpdatesEnabled,
		ManualUpdates:  h.build.ManualUpdates,
	}
}

func (h *AppHandler) GetPreferences() (appconfig.Preferences, error) {
	value, err := h.preferences.Load()
	if err != nil {
		// A quarantined corrupt preference file should not prevent the app from opening.
		return appconfig.Defaults(), nil
	}
	return value, nil
}

func (h *AppHandler) SavePreferences(value appconfig.Preferences) error {
	return h.preferences.Save(value)
}

func (h *AppHandler) SetTheme(value string) error {
	_, err := h.preferences.Update(func(p *appconfig.Preferences) error {
		p.Theme = value
		return nil
	})
	return err
}

func (h *AppHandler) SetDensity(value string) error {
	_, err := h.preferences.Update(func(p *appconfig.Preferences) error {
		p.Density = value
		return nil
	})
	return err
}

func (h *AppHandler) SetAutomaticUpdates(value bool) error {
	_, err := h.preferences.Update(func(p *appconfig.Preferences) error {
		p.AutomaticUpdates = value
		return nil
	})
	return err
}

func (h *AppHandler) RecordUpdateCheck() error {
	_, err := h.preferences.Update(func(p *appconfig.Preferences) error {
		p.LastUpdateCheckUTC = time.Now().UTC().Format(time.RFC3339)
		return nil
	})
	return err
}

func (h *AppHandler) ConsumeUpdateNotice() string {
	healthyPath := filepath.Join(h.paths.StateRoot, "last-update-healthy.json")
	raw, err := os.ReadFile(healthyPath)
	if err != nil {
		return ""
	}
	var value struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(raw, &value) != nil || value.Version == "" {
		return ""
	}
	consumedPath := filepath.Join(h.paths.StateRoot, "update-notice-consumed")
	if consumed, _ := os.ReadFile(consumedPath); string(consumed) == value.Version {
		return ""
	}
	if err := fileutil.AtomicWrite(consumedPath, []byte(value.Version), 0600); err != nil {
		return ""
	}
	return value.Version
}

func (h *AppHandler) SaveRecovery(id, rawDocument string) error {
	if rawDocument == "" {
		return errors.New("recovery document is required")
	}
	return h.recovery.Save(id, json.RawMessage(rawDocument))
}

func (h *AppHandler) LoadRecovery(id string) (*recovery.Checkpoint, error) {
	return h.recovery.Load(id)
}

func (h *AppHandler) ClearRecovery(id string) error {
	return h.recovery.Clear(id)
}

// ExportDiagnostics creates a user-selected support archive containing only
// build metadata and capability flags. Timing/error evidence is exported from
// an explicit diagnostics recording; raw logs can contain user context and are
// intentionally excluded. It never includes the database, quotation content,
// managed images, or recovery checkpoints.
func (h *AppHandler) ExportDiagnostics() (string, error) {
	destination, err := wailsRuntime.SaveFileDialog(h.ctx, wailsRuntime.SaveDialogOptions{
		Title: "Export Quotier Labs Diagnostics", DefaultFilename: "quotier-labs-diagnostics.zip",
		Filters: []wailsRuntime.FileFilter{{DisplayName: "ZIP archive", Pattern: "*.zip"}},
	})
	if err != nil || destination == "" {
		return "", err
	}
	tmp, err := os.CreateTemp(filepath.Dir(destination), ".diagnostics-*.partial")
	if err != nil {
		return "", err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	_ = tmp.Chmod(0600)
	zw := zip.NewWriter(tmp)
	info, _ := json.MarshalIndent(h.GetAppInfo(), "", "  ")
	entry, _ := zw.Create("build-info.json")
	_, _ = entry.Write(info)
	support, marshalErr := supportBundleMetadata()
	if marshalErr != nil {
		_ = tmp.Close()
		return "", marshalErr
	}
	entry, entryErr := zw.Create("support-bundle.json")
	if entryErr != nil {
		_ = tmp.Close()
		return "", entryErr
	}
	_, _ = entry.Write(support)
	if err := zw.Close(); err != nil {
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
		return "", fmt.Errorf("save diagnostics: %w", err)
	}
	return destination, nil
}

func supportBundleMetadata() ([]byte, error) {
	return json.MarshalIndent(struct {
		SchemaVersion int `json:"schema_version"`
	}{SchemaVersion: 1}, "", "  ")
}

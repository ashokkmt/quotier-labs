package apppaths

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"quotierlabs/backend/infrastructure/appidentity"
)

type Paths struct {
	InstallRoot     string
	DataRoot        string
	ConfigRoot      string
	StateRoot       string
	LogRoot         string
	CrashRoot       string
	CacheRoot       string
	WebViewRoot     string
	RuntimeRoot     string
	TempRoot        string
	BackupRoot      string
	ExportRoot      string
	DiagnosticsRoot string
}

func (p Paths) DBPath() string       { return filepath.Join(p.DataRoot, "db", "quotierlabs.sqlite3") }
func (p Paths) AssetsRoot() string   { return filepath.Join(p.DataRoot, "assets") }
func (p Paths) SettingsPath() string { return filepath.Join(p.ConfigRoot, "settings.json") }
func (p Paths) RecoveryRoot() string { return filepath.Join(p.StateRoot, "recovery") }
func (p Paths) LogPath() string      { return filepath.Join(p.LogRoot, "quotierlabs.jsonl") }

type Options struct {
	Build   appidentity.BuildInfo
	DevRoot string
	GOOS    string
	HomeDir string
	Env     map[string]string
}

func Resolve(opts Options) (Paths, error) {
	goos := opts.GOOS
	if goos == "" {
		goos = runtime.GOOS
	}
	home := opts.HomeDir
	if home == "" {
		var err error
		home, err = os.UserHomeDir()
		if err != nil {
			return Paths{}, fmt.Errorf("resolve home directory: %w", err)
		}
	}
	env := func(key string) string {
		if opts.Env != nil {
			return opts.Env[key]
		}
		return os.Getenv(key)
	}

	exe, _ := os.Executable()
	p := Paths{InstallRoot: filepath.Dir(exe)}
	if opts.Build.Channel == "development" {
		root := opts.DevRoot
		if root == "" {
			root = env("QUOTIERLABS_DEV_ROOT")
		}
		if root == "" {
			root = findRepositoryRoot()
		}
		if root == "" || !filepath.IsAbs(root) {
			return Paths{}, errors.New("development data root must be an absolute path; run through make dev")
		}
		root = filepath.Join(filepath.Clean(root), ".devdata", "quotier-labs")
		p.DataRoot = filepath.Join(root, "data")
		p.ConfigRoot = filepath.Join(root, "config")
		p.StateRoot = filepath.Join(root, "state")
		p.LogRoot = filepath.Join(root, "logs")
		p.CrashRoot = filepath.Join(root, "crashes")
		p.CacheRoot = filepath.Join(root, "cache")
		p.WebViewRoot = filepath.Join(root, "webview")
		p.RuntimeRoot = filepath.Join(root, "runtime")
		p.BackupRoot = filepath.Join(root, "backups")
		p.ExportRoot = filepath.Join(root, "exports")
		p.DiagnosticsRoot = filepath.Join(root, "diagnostics")
		p.TempRoot = filepath.Join(root, "tmp")
		if err := createRoots(p, root); err != nil {
			return Paths{}, err
		}
		session, err := os.MkdirTemp(p.TempRoot, "session-")
		if err != nil {
			return Paths{}, fmt.Errorf("create private temporary directory: %w", err)
		}
		_ = os.Chmod(session, 0700)
		p.TempRoot = session
		if err := os.WriteFile(filepath.Join(root, ".quotier-devdata"), []byte("Quotier Labs development data\n"), 0600); err != nil {
			return Paths{}, fmt.Errorf("write development marker: %w", err)
		}
		return p, nil
	}

	suffix := ""
	if opts.Build.Channel == "beta" {
		suffix = " Beta"
	}
	switch goos {
	case "windows":
		local := absoluteEnv(env("LOCALAPPDATA"), filepath.Join(home, "AppData", "Local"))
		roaming := absoluteEnv(env("APPDATA"), filepath.Join(home, "AppData", "Roaming"))
		base := filepath.Join(local, appidentity.Vendor, appidentity.ProductName+suffix)
		p.DataRoot = filepath.Join(base, "data")
		p.ConfigRoot = filepath.Join(roaming, appidentity.Vendor, appidentity.ProductName+suffix, "config")
		p.StateRoot = filepath.Join(base, "state")
		p.LogRoot = filepath.Join(base, "logs")
		p.CrashRoot = filepath.Join(base, "crashes")
		p.CacheRoot = filepath.Join(base, "cache")
		p.WebViewRoot = filepath.Join(base, "webview")
		p.RuntimeRoot = filepath.Join(base, "runtime")
		if opts.Build.Channel == "beta" {
			p.DiagnosticsRoot = filepath.Join(p.StateRoot, "diagnostics")
		}
	case "darwin":
		id := opts.Build.AppID
		base := filepath.Join(home, "Library", "Application Support", id)
		p.DataRoot = filepath.Join(base, "data")
		p.ConfigRoot = filepath.Join(base, "config")
		p.StateRoot = filepath.Join(base, "state")
		p.LogRoot = filepath.Join(home, "Library", "Logs", id)
		p.CrashRoot = filepath.Join(p.LogRoot, "crashes")
		p.CacheRoot = filepath.Join(home, "Library", "Caches", id)
		p.WebViewRoot = filepath.Join(p.CacheRoot, "webview")
		p.RuntimeRoot = filepath.Join(p.StateRoot, "runtime")
		if opts.Build.Channel == "beta" {
			p.DiagnosticsRoot = filepath.Join(p.StateRoot, "diagnostics")
		}
	default:
		slug := appidentity.Slug
		if opts.Build.Channel == "beta" {
			slug += "-beta"
		}
		data := xdg(env("XDG_DATA_HOME"), filepath.Join(home, ".local", "share"))
		config := xdg(env("XDG_CONFIG_HOME"), filepath.Join(home, ".config"))
		state := xdg(env("XDG_STATE_HOME"), filepath.Join(home, ".local", "state"))
		cache := xdg(env("XDG_CACHE_HOME"), filepath.Join(home, ".cache"))
		p.DataRoot = filepath.Join(data, slug)
		p.ConfigRoot = filepath.Join(config, slug)
		p.StateRoot = filepath.Join(state, slug)
		p.LogRoot = filepath.Join(p.StateRoot, "logs")
		p.CrashRoot = filepath.Join(p.StateRoot, "crashes")
		p.CacheRoot = filepath.Join(cache, slug)
		p.WebViewRoot = filepath.Join(p.CacheRoot, "webview")
		runtimeBase := env("XDG_RUNTIME_DIR")
		if !filepath.IsAbs(runtimeBase) {
			runtimeBase = filepath.Join(p.StateRoot, "runtime")
		}
		p.RuntimeRoot = filepath.Join(runtimeBase, slug)
		if opts.Build.Channel == "beta" {
			p.DiagnosticsRoot = filepath.Join(p.StateRoot, "diagnostics")
		}
	}
	p.TempRoot = filepath.Join(p.CacheRoot, "tmp")
	if err := createRoots(p, ""); err != nil {
		return Paths{}, err
	}
	session, err := os.MkdirTemp(p.TempRoot, "session-")
	if err != nil {
		return Paths{}, fmt.Errorf("create private temporary directory: %w", err)
	}
	_ = os.Chmod(session, 0700)
	p.TempRoot = session
	return p, nil
}

func createRoots(p Paths, devBase string) error {
	dirs := []string{p.DataRoot, filepath.Join(p.DataRoot, "db"), p.AssetsRoot(), p.ConfigRoot, p.StateRoot, p.RecoveryRoot(), p.LogRoot, p.CrashRoot, p.CacheRoot, p.WebViewRoot, p.RuntimeRoot, p.TempRoot}
	if p.DiagnosticsRoot != "" {
		dirs = append(dirs, p.DiagnosticsRoot)
	}
	if devBase != "" {
		dirs = append(dirs, p.BackupRoot, p.ExportRoot)
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("create application directory %q: %w", filepath.Base(dir), err)
		}
		_ = os.Chmod(dir, 0700)
	}
	return nil
}

func xdg(value, fallback string) string {
	if filepath.IsAbs(value) {
		return filepath.Clean(value)
	}
	return fallback
}

func absoluteEnv(value, fallback string) string {
	if filepath.IsAbs(value) {
		return filepath.Clean(value)
	}
	return fallback
}

func findRepositoryRoot() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}
	for current := filepath.Clean(cwd); ; current = filepath.Dir(current) {
		if info, err := os.Stat(filepath.Join(current, "go.mod")); err == nil && !info.IsDir() {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current || strings.TrimSpace(current) == "" {
			return ""
		}
	}
}

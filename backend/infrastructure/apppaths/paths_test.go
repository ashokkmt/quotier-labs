package apppaths

import (
	"path/filepath"
	"testing"

	"quotierlabs/backend/infrastructure/appidentity"
)

func TestDevelopmentPathsStayInRepository(t *testing.T) {
	repo := t.TempDir()
	p, err := Resolve(Options{Build: appidentity.BuildInfo{Channel: "development", AppID: appidentity.AppID + ".Dev"}, DevRoot: repo, GOOS: "darwin", HomeDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(repo, ".devdata", "quotier-labs")
	for _, got := range []string{p.DataRoot, p.ConfigRoot, p.LogRoot, p.CrashRoot, p.BackupRoot, p.ExportRoot, p.TempRoot} {
		rel, err := filepath.Rel(want, got)
		if err != nil || rel == ".." || filepath.IsAbs(rel) {
			t.Fatalf("path %q escaped development root %q", got, want)
		}
	}
}

func TestLinuxIgnoresRelativeXDGValues(t *testing.T) {
	home := t.TempDir()
	p, err := Resolve(Options{Build: appidentity.BuildInfo{Channel: "production", AppID: appidentity.AppID}, GOOS: "linux", HomeDir: home, Env: map[string]string{"XDG_DATA_HOME": "relative", "XDG_CONFIG_HOME": "also-relative"}})
	if err != nil {
		t.Fatal(err)
	}
	if p.DataRoot != filepath.Join(home, ".local", "share", appidentity.Slug) {
		t.Fatalf("unexpected data root: %s", p.DataRoot)
	}
	if p.ConfigRoot != filepath.Join(home, ".config", appidentity.Slug) {
		t.Fatalf("unexpected config root: %s", p.ConfigRoot)
	}
}

func TestWindowsSeparatesLocalDataAndRoamingConfig(t *testing.T) {
	home := t.TempDir()
	local := filepath.Join(home, "Local Data")
	roaming := filepath.Join(home, "Roaming Data")
	p, err := Resolve(Options{Build: appidentity.BuildInfo{Channel: "production", AppID: appidentity.AppID}, GOOS: "windows", HomeDir: home, Env: map[string]string{"LOCALAPPDATA": local, "APPDATA": roaming}})
	if err != nil {
		t.Fatal(err)
	}
	if p.DataRoot == p.ConfigRoot {
		t.Fatal("local data and roaming config must be distinct")
	}
	if filepath.Dir(filepath.Dir(p.DataRoot)) != filepath.Join(local, appidentity.Vendor) {
		t.Fatalf("durable data was not placed below Local AppData: %s", p.DataRoot)
	}
}

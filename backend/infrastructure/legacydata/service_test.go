package legacydata

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
	appsqlite "quotierlabs/backend/infrastructure/sqlite"
)

func TestDiscoverImportAndSkipLegacyDevelopmentDatabase(t *testing.T) {
	repository := t.TempDir()
	paths := testPaths(repository)
	for _, dir := range []string{filepath.Dir(paths.DBPath()), paths.StateRoot} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}

	legacyDB, err := appsqlite.NewDB(filepath.Join(repository, "quotierlabs.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := legacyDB.Exec(`INSERT INTO companies (id, name, currency, is_active, created_at, updated_at, version) VALUES ('legacy-company', 'Legacy Co', 'INR', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`).Error; err != nil {
		t.Fatal(err)
	}
	legacySQL, _ := legacyDB.DB()
	_ = legacySQL.Close()

	targetDB, err := appsqlite.NewDB(paths.DBPath())
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(targetDB, paths, appidentity.BuildInfo{Channel: "development"})
	candidates, err := service.Discover(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(candidates) != 1 || candidates[0].CompanyCount != 1 {
		t.Fatalf("unexpected candidates: %#v", candidates)
	}
	if err := service.Import(context.Background(), candidates[0].Path); err != nil {
		t.Fatal(err)
	}

	imported, err := appsqlite.NewDB(paths.DBPath())
	if err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := imported.Table("companies").Where("id = ?", "legacy-company").Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("imported company count=%d err=%v", count, err)
	}
	if _, err := os.Stat(filepath.Join(repository, "quotierlabs.db")); err != nil {
		t.Fatalf("legacy source was not preserved: %v", err)
	}
	if candidates, err := service.Discover(context.Background()); err != nil || len(candidates) != 0 {
		t.Fatalf("migration should not be offered twice: %#v %v", candidates, err)
	}
}

func TestSkipLegacyDataWritesReceipt(t *testing.T) {
	repository := t.TempDir()
	paths := testPaths(repository)
	if err := os.MkdirAll(paths.StateRoot, 0700); err != nil {
		t.Fatal(err)
	}
	service := &Service{paths: paths}
	if err := service.Skip(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(paths.StateRoot, "legacy-import-v1.json")); err != nil {
		t.Fatal(err)
	}
}

func testPaths(repository string) apppaths.Paths {
	base := filepath.Join(repository, ".devdata", "quotier-labs")
	return apppaths.Paths{
		DataRoot:  filepath.Join(base, "data"),
		StateRoot: filepath.Join(base, "state"),
	}
}

package lifecycle

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
	"quotierlabs/backend/infrastructure/sqlite"
)

func TestPendingUpdateMustMatchInstalledSchemasBeforeMigration(t *testing.T) {
	root := t.TempDir()
	paths := apppaths.Paths{StateRoot: root}
	target, err := sqlite.TargetSchemaVersion()
	if err != nil {
		t.Fatal(err)
	}
	raw := []byte(fmt.Sprintf(`{"schema_version":1,"from":"1.0.0","to":"2.0.0","db_schema_after":%d,"document_schema_after":%d}`, target, documentmodel.SchemaVersion))
	if err := os.WriteFile(filepath.Join(root, "update-pending.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	if err := ValidatePendingUpdate(paths, appidentity.BuildInfo{Version: "2.0.0"}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "update-pending.json"), []byte(`{"schema_version":1,"from":"1.0.0","to":"2.0.0","db_schema_after":999,"document_schema_after":5}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := ValidatePendingUpdate(paths, appidentity.BuildInfo{Version: "2.0.0"}); err == nil {
		t.Fatal("expected mismatched installed schema to block update migration")
	}
	if err := ValidatePendingUpdate(paths, appidentity.BuildInfo{Version: "1.0.0"}); err != nil {
		t.Fatalf("old binary after installer cancellation should remain usable: %v", err)
	}
}

package wails

import (
	"bytes"
	"testing"

	appconfig "quotierlabs/backend/infrastructure/config"
)

func TestSupportBundleMetadataContainsOnlyCapabilityState(t *testing.T) {
	raw, err := supportBundleMetadata(appconfig.Preferences{V6EditorEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(raw, []byte(`"v6_editor_enabled": true`)) {
		t.Fatalf("missing V6 capability state: %s", raw)
	}
	for _, forbidden := range [][]byte{[]byte("document"), []byte("customer"), []byte("path"), []byte("gstin")} {
		if bytes.Contains(bytes.ToLower(raw), forbidden) {
			t.Fatalf("support metadata leaked %q: %s", forbidden, raw)
		}
	}
}

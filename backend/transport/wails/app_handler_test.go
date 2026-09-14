package wails

import (
	"bytes"
	"testing"
)

func TestSupportBundleMetadataContainsOnlyCapabilityState(t *testing.T) {
	raw, err := supportBundleMetadata()
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("v6_editor_enabled")) {
		t.Fatalf("obsolete V6 preview flag leaked: %s", raw)
	}
	for _, forbidden := range [][]byte{[]byte("document"), []byte("customer"), []byte("path"), []byte("gstin")} {
		if bytes.Contains(bytes.ToLower(raw), forbidden) {
			t.Fatalf("support metadata leaked %q: %s", forbidden, raw)
		}
	}
}

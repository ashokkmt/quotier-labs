package fileutil

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicWriteReplacesExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := AtomicWrite(path, []byte("first"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := AtomicWrite(path, []byte("second"), 0600); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil || string(raw) != "second" {
		t.Fatalf("unexpected atomic content %q: %v", raw, err)
	}
}

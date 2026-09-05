package logging

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestRotatingSinkBoundsAndProtectsFiles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "quotierlabs.jsonl")
	sink, err := openSink(path)
	if err != nil {
		t.Fatal(err)
	}
	// The sink owns the open file handle; it must be closed before the
	// temporary directory is removed. Windows cannot delete a file while a
	// handle is open. Close must be idempotent, so the explicit Close below
	// is still exercised even with this safety net.
	t.Cleanup(func() { _ = sink.Close() })
	chunk := bytes.Repeat([]byte("x"), maxLogBytes/2+1)
	if _, err := sink.Write(chunk); err != nil {
		t.Fatal(err)
	}
	if _, err := sink.Write(chunk); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path + ".1"); err != nil {
		t.Fatalf("expected rotated log: %v", err)
	}
	assertPrivateFile(t, path)
	assertPrivateFile(t, path+".1")
	if err := sink.Close(); err != nil {
		t.Fatalf("close sink: %v", err)
	}
	if err := sink.Close(); err != nil {
		t.Fatalf("close sink must be idempotent: %v", err)
	}
	if err := sink.Sync(); err != nil {
		t.Fatalf("sync after close must not fail: %v", err)
	}
	if _, err := sink.Write([]byte("after-close")); err == nil {
		t.Fatal("write after close must fail")
	}
}

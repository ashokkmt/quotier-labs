package logging

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestRotatingSinkBoundsAndProtectsFiles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "quotierlabs.jsonl")
	sink, err := openRotatingSink(path)
	if err != nil {
		t.Fatal(err)
	}
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
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm()&0077 != 0 {
		t.Fatalf("current log must be private: info=%v err=%v", info, err)
	}
}

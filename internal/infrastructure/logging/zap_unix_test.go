//go:build !windows

package logging

import (
	"os"
	"testing"
)

// assertPrivateFile verifies the POSIX form of the privacy guarantee: no
// group or other access bits may be set on the log file.
func assertPrivateFile(t *testing.T, path string) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm()&0077 != 0 {
		t.Fatalf("current log must be private: info=%v", info)
	}
}

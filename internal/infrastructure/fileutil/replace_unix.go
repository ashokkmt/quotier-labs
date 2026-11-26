//go:build !windows

package fileutil

import (
	"os"
	"path/filepath"
)

func Replace(source, destination string) error {
	if err := os.Rename(source, destination); err != nil {
		return err
	}
	if dir, err := os.Open(filepath.Dir(destination)); err == nil {
		_ = dir.Sync()
		_ = dir.Close()
	}
	return nil
}

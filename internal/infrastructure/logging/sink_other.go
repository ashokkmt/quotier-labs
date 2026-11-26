//go:build !windows

package logging

// protectPrivateFile is a no-op outside Windows: POSIX platforms enforce the
// 0600 mode requested at file creation directly.
func protectPrivateFile(path string) error { return nil }

//go:build windows

package lifecycle

import (
	"os"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

func lockFile(f *os.File) error {
	var overlapped syscall.Overlapped
	return windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, (*windows.Overlapped)(unsafe.Pointer(&overlapped)))
}

func unlockFile(f *os.File) error {
	var overlapped syscall.Overlapped
	return windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, (*windows.Overlapped)(unsafe.Pointer(&overlapped)))
}

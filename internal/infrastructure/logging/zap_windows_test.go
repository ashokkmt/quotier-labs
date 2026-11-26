//go:build windows

package logging

import (
	"testing"
	"unsafe"

	"golang.org/x/sys/windows"
)

// assertPrivateFile verifies the Windows equivalent of POSIX 0600: the NTFS
// DACL must grant access only to the current user, SYSTEM, and the built-in
// Administrators group. os.Stat mode bits are meaningless here (Go reports
// 0666 for any writable file), so the DACL is the real guarantee.
func assertPrivateFile(t *testing.T, path string) {
	t.Helper()
	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatalf("read log file DACL: %v", err)
	}
	if sd == nil {
		t.Fatal("log file has no security descriptor")
	}
	// DACL returns ERROR_OBJECT_NOT_FOUND when no DACL is present.
	dacl, _, err := sd.DACL()
	if err != nil || dacl == nil || dacl.AceCount == 0 {
		t.Fatalf("log file must carry an explicit DACL: dacl=%v err=%v", dacl, err)
	}
	if dacl.AceCount == 0 {
		t.Fatal("log file DACL is empty")
	}
	token, err := windows.OpenCurrentProcessToken()
	if err != nil {
		t.Fatal(err)
	}
	defer token.Close()
	user, err := token.GetTokenUser()
	if err != nil {
		t.Fatal(err)
	}
	system, err := windows.CreateWellKnownSid(windows.WinLocalSystemSid)
	if err != nil {
		t.Fatal(err)
	}
	administrators, err := windows.CreateWellKnownSid(windows.WinBuiltinAdministratorsSid)
	if err != nil {
		t.Fatal(err)
	}
	for i := uint32(0); i < uint32(dacl.AceCount); i++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(dacl, i, &ace); err != nil {
			t.Fatalf("read ACE %d: %v", i, err)
		}
		if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE {
			t.Fatalf("unexpected ACE type %d in log file DACL", ace.Header.AceType)
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
		if !sid.Equals(user.User.Sid) && !sid.Equals(system) && !sid.Equals(administrators) {
			t.Fatalf("log file DACL grants access to %s", sid.String())
		}
	}
}

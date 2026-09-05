//go:build windows

package logging

import (
	"fmt"

	"golang.org/x/sys/windows"
)

// protectPrivateFile restricts the file's NTFS DACL to the current user,
// SYSTEM, and the built-in Administrators group. Windows does not honor POSIX
// mode bits, so without an explicit ACL access would be governed entirely by
// whatever the parent directory inherits. The DACL is protected, so inherited
// permissive entries are stripped.
func protectPrivateFile(path string) error {
	token, err := windows.OpenCurrentProcessToken()
	if err != nil {
		return fmt.Errorf("open process token: %w", err)
	}
	defer token.Close()
	user, err := token.GetTokenUser()
	if err != nil {
		return fmt.Errorf("resolve current user: %w", err)
	}
	system, err := windows.CreateWellKnownSid(windows.WinLocalSystemSid)
	if err != nil {
		return fmt.Errorf("resolve SYSTEM identity: %w", err)
	}
	administrators, err := windows.CreateWellKnownSid(windows.WinBuiltinAdministratorsSid)
	if err != nil {
		return fmt.Errorf("resolve Administrators identity: %w", err)
	}
	grants := []windows.EXPLICIT_ACCESS{
		privateGrant(user.User.Sid),
		privateGrant(system),
		privateGrant(administrators),
	}
	dacl, err := windows.ACLFromEntries(grants, nil)
	if err != nil {
		return fmt.Errorf("build private ACL: %w", err)
	}
	if err := windows.SetNamedSecurityInfo(path, windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
		nil, nil, dacl, nil); err != nil {
		return fmt.Errorf("restrict file access: %w", err)
	}
	return nil
}

func privateGrant(sid *windows.SID) windows.EXPLICIT_ACCESS {
	return windows.EXPLICIT_ACCESS{
		AccessPermissions: windows.GENERIC_ALL,
		AccessMode:        windows.GRANT_ACCESS,
		Inheritance:       windows.NO_INHERITANCE,
		Trustee: windows.TRUSTEE{
			TrusteeForm:  windows.TRUSTEE_IS_SID,
			TrusteeType:  windows.TRUSTEE_IS_UNKNOWN,
			TrusteeValue: windows.TrusteeValueFromSID(sid),
		},
	}
}

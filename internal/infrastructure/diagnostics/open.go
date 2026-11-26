package diagnostics

import (
	"fmt"
	"os/exec"
	"runtime"
)

// OpenRoot asks the native shell to reveal the application-owned diagnostics
// directory. The path is resolved internally and never comes from the WebView.
func (m *Manager) OpenRoot() error {
	if !m.available() || m.paths.DiagnosticsRoot == "" {
		return ErrUnavailable
	}
	var command *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		command = exec.Command("explorer", m.paths.DiagnosticsRoot)
	case "darwin":
		command = exec.Command("open", m.paths.DiagnosticsRoot)
	case "linux":
		command = exec.Command("xdg-open", m.paths.DiagnosticsRoot)
	default:
		return fmt.Errorf("opening a diagnostics folder is unsupported on this platform")
	}
	return command.Start()
}

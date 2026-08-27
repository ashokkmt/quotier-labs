package os

import (
	"fmt"
	"os/exec"
	"runtime"
)

type ShareService struct{}

func NewShareService() *ShareService {
	return &ShareService{}
}

func (s *ShareService) SharePDF(filePath string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		// Windows: Open With dialog via rundll32
		cmd = exec.Command("rundll32", "shell32.dll,OpenAs_RunDLL", filePath)
	case "darwin":
		// macOS: NSSharingServicePicker isn't easily accessible via CLI without applescript/swift.
		// Fallback: reveal in Finder so the user can easily click "Share" from there.
		// Or try `open -R <file>` to reveal.
		cmd = exec.Command("open", "-R", filePath)
	case "linux":
		cmd = exec.Command("xdg-open", filePath)
	default:
		return fmt.Errorf("unsupported platform")
	}

	return cmd.Start()
}

func (s *ShareService) OpenPDF(filePath string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", filePath)
	case "darwin":
		cmd = exec.Command("open", filePath)
	case "linux":
		cmd = exec.Command("xdg-open", filePath)
	default:
		return fmt.Errorf("unsupported platform")
	}

	return cmd.Start()
}

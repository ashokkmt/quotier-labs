package os

import (
	"fmt"
	"os/exec"
	"runtime"
)

type PrintService struct{}

func NewPrintService() *PrintService {
	return &PrintService{}
}

func (s *PrintService) PrintPDF(filePath string) error {
	cmd, err := printCommand(runtime.GOOS, filePath)
	if err != nil {
		return err
	}
	return cmd.Start() // non-blocking
}

func printCommand(goos, filePath string) (*exec.Cmd, error) {
	switch goos {
	case "windows":
		return exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", "Start-Process -LiteralPath $args[0] -Verb Print", filePath), nil
	case "darwin":
		// The PDF path is passed as argv, never interpolated into AppleScript source.
		const script = `on run argv
set pdfFile to POSIX file (item 1 of argv)
tell application "Preview"
  activate
  open pdfFile
  print document 1 with print dialog
end tell
end run`
		return exec.Command("osascript", "-e", script, filePath), nil
	case "linux":
		return exec.Command("xdg-open", filePath), nil
	default:
		return nil, fmt.Errorf("unsupported platform")
	}
}

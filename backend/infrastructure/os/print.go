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
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		// Windows: use Start-Process with -Verb Print
		cmd = exec.Command("powershell", "-Command", fmt.Sprintf("Start-Process -FilePath '%s' -Verb Print", filePath))
	case "darwin":
		// macOS: open with Preview or use lpr if silent printing is acceptable. 
		// "open -a Preview document.pdf" opens it. We'll use "lpr" for now or just "open".
		// Actually, to show print dialog on Mac from CLI is tricky, 
		// but `open` followed by instructing the user, or `lpr` to default printer.
		// A common workaround is opening the file, but let's try `lp`.
		cmd = exec.Command("open", filePath) 
	case "linux":
		cmd = exec.Command("xdg-open", filePath)
	default:
		return fmt.Errorf("unsupported platform")
	}

	return cmd.Start() // non-blocking
}

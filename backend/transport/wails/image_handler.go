package wails

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	wails_runtime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (h *CompanyHandler) SelectImage(dialogTitle string) (string, error) {
	selectedFile, err := wails_runtime.OpenFileDialog(h.ctx, wails_runtime.OpenDialogOptions{
		Title: dialogTitle,
		Filters: []wails_runtime.FileFilter{
			{DisplayName: "Images", Pattern: "*.png;*.jpg;*.jpeg;*.webp"},
		},
	})
	if err != nil {
		return "", err
	}
	if selectedFile == "" {
		return "", nil // user cancelled
	}

	// Validate file size
	info, err := os.Stat(selectedFile)
	if err != nil {
		return "", fmt.Errorf("failed to read file info: %v", err)
	}
	if info.Size() > 5*1024*1024 {
		return "", fmt.Errorf("image exceeds 5MB size limit")
	}

	// Validate extension
	ext := strings.ToLower(filepath.Ext(selectedFile))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" {
		return "", fmt.Errorf("unsupported image format")
	}

	// Store in managed directory
	appDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("failed to get config dir: %v", err)
	}
	
	destDir := filepath.Join(appDir, "QuotierLabs", "images")
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create image directory: %v", err)
	}

	fileName := fmt.Sprintf("%s%s", filepath.Base(selectedFile[:len(selectedFile)-len(ext)]), ext)
	destPath := filepath.Join(destDir, fileName)

	// Copy file
	src, err := os.Open(selectedFile)
	if err != nil {
		return "", err
	}
	defer src.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}

	// For Wails AssetServer to serve files from local disk, you normally need to prefix or use wails:// protocol
	// We return the absolute path, and frontend can use `asset://` or whatever Wails is configured to use.
	// Wails v2 uses `wails://` or relative paths. We will just return the absolute path and let frontend map it.
	return destPath, nil
}

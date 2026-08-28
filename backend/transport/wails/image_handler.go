package wails

import (
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	wails_runtime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// GetImageDataURI exposes only images previously copied into the application's
// managed image directory. It prevents a document's stored path from becoming
// an arbitrary local-file read in the webview.
func (h *CompanyHandler) GetImageDataURI(path string) (string, error) {
	appDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("failed to resolve image directory")
	}
	imagesDir := filepath.Join(appDir, "QuotierLabs", "images")
	cleanPath := filepath.Clean(path)
	rel, err := filepath.Rel(imagesDir, cleanPath)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", fmt.Errorf("image path is outside the managed directory")
	}
	ext := strings.ToLower(filepath.Ext(cleanPath))
	mime := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}[ext]
	if mime == "" {
		return "", fmt.Errorf("unsupported image format")
	}
	info, err := os.Stat(cleanPath)
	if err != nil || info.Size() > 5*1024*1024 {
		return "", fmt.Errorf("image is unavailable or exceeds the size limit")
	}
	data, err := os.ReadFile(cleanPath)
	if err != nil {
		return "", fmt.Errorf("failed to read managed image")
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

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

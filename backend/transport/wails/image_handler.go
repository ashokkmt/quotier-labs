package wails

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	wails_runtime "github.com/wailsapp/wails/v2/pkg/runtime"
	"quotierlabs/backend/infrastructure/assets"
	"quotierlabs/backend/infrastructure/fileutil"
)

// GetImageDataURI exposes only images previously copied into the application's
// managed image directory. It prevents a document's stored path from becoming
// an arbitrary local-file read in the webview.
func (h *CompanyHandler) GetImageDataURI(path string) (string, error) {
	imagesDir := h.paths.AssetsRoot()
	cleanPath := ""
	if strings.HasPrefix(path, "asset:") {
		name := strings.TrimPrefix(path, "asset:")
		if name == "" || filepath.Base(name) != name {
			return "", fmt.Errorf("invalid managed image")
		}
		cleanPath = filepath.Join(imagesDir, name)
	} else {
		cleanPath = filepath.Clean(path)
	}
	rel, err := filepath.Rel(imagesDir, cleanPath)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		// Read-only compatibility for images imported by pre-AppPaths builds.
		legacyConfig, configErr := os.UserConfigDir()
		legacyRoot := filepath.Join(legacyConfig, "QuotierLabs", "images")
		legacyRel, legacyErr := filepath.Rel(legacyRoot, cleanPath)
		if configErr != nil || legacyErr != nil || legacyRel == "." || strings.HasPrefix(legacyRel, "..") || filepath.IsAbs(legacyRel) {
			return "", fmt.Errorf("image path is outside the managed directory")
		}
	}
	ext := strings.ToLower(filepath.Ext(cleanPath))
	mime := assets.MIMEForExtension(ext)
	if mime == "" {
		return "", fmt.Errorf("unsupported image format")
	}
	info, err := os.Stat(cleanPath)
	if err != nil || info.IsDir() || info.Size() > assets.MaxImageBytes {
		return "", fmt.Errorf("image is unavailable or exceeds the size limit")
	}
	data, err := os.ReadFile(cleanPath)
	if err != nil {
		return "", fmt.Errorf("failed to read managed image")
	}
	if err := assets.ValidateImage(data, ext); err != nil {
		return "", err
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
	if info.Size() > assets.MaxImageBytes {
		return "", fmt.Errorf("image exceeds 5MB size limit")
	}

	// Validate extension
	ext := strings.ToLower(filepath.Ext(selectedFile))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" {
		return "", fmt.Errorf("unsupported image format")
	}

	data, err := os.ReadFile(selectedFile)
	if err != nil {
		return "", fmt.Errorf("failed to read image")
	}
	if err := assets.ValidateImage(data, ext); err != nil {
		return "", err
	}

	destDir := h.paths.AssetsRoot()
	if err := os.MkdirAll(destDir, 0700); err != nil {
		return "", fmt.Errorf("failed to create image directory: %v", err)
	}

	digest := sha256.Sum256(data)
	fileName := fmt.Sprintf("%x%s", digest[:], ext)
	destPath := filepath.Join(destDir, fileName)
	if info, err := os.Stat(destPath); err == nil {
		if !info.Mode().IsRegular() {
			return "", fmt.Errorf("managed image destination is not a regular file")
		}
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("failed to inspect managed image destination")
	} else if err := fileutil.AtomicWrite(destPath, data, 0600); err != nil {
		return "", fmt.Errorf("failed to store managed image")
	}
	return "asset:" + fileName, nil
}

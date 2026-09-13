package wails

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/infrastructure/apppaths"
	"quotierlabs/backend/infrastructure/fileutil"
)

type ExportHandler struct {
	exportService *document.ExportService
	printService  document.PrintService
	shareService  document.ShareService
	ctx           context.Context
	paths         apppaths.Paths
}

func NewExportHandler(
	exportService *document.ExportService,
	printService document.PrintService,
	shareService document.ShareService,
	paths apppaths.Paths,
) *ExportHandler {
	return &ExportHandler{
		exportService: exportService,
		printService:  printService,
		shareService:  shareService,
		paths:         paths,
	}
}

func (h *ExportHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

// SaveDOCX writes a browser-generated, bounded DOCX package through the desktop save dialog.
// Export never mutates the quotation and the final destination is replaced atomically.
func (h *ExportHandler) SaveDOCX(encoded, defaultFilename string) (string, error) {
	if len(encoded) == 0 || len(encoded) > 48<<20 {
		return "", fmt.Errorf("DOCX output is empty or exceeds the size limit")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > 32<<20 || !bytes.HasPrefix(data, []byte("PK")) {
		return "", fmt.Errorf("DOCX output is invalid")
	}
	if err := validateDOCXPackage(data); err != nil {
		return "", err
	}
	name := filepath.Base(strings.TrimSpace(defaultFilename))
	if name == "." || name == "" {
		name = "quotation.docx"
	}
	if !strings.EqualFold(filepath.Ext(name), ".docx") {
		name += ".docx"
	}
	savePath, err := wailsRuntime.SaveFileDialog(h.ctx, wailsRuntime.SaveDialogOptions{
		DefaultFilename: name,
		Title:           "Save Quotation DOCX",
		Filters:         []wailsRuntime.FileFilter{{DisplayName: "Word Documents (*.docx)", Pattern: "*.docx"}},
	})
	if err != nil || savePath == "" {
		return "", err
	}
	if err := fileutil.AtomicWrite(savePath, data, 0644); err != nil {
		return "", fmt.Errorf("could not save DOCX")
	}
	return savePath, nil
}

func (h *ExportHandler) SavePDF(companyID, quotationID string) (string, error) {
	bytes, defaultFilename, err := h.exportService.GeneratePDFBytes(h.ctx, companyID, quotationID)
	if err != nil {
		return "", err
	}

	savePath, err := wailsRuntime.SaveFileDialog(h.ctx, wailsRuntime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Save Quotation PDF",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "PDF Files (*.pdf)", Pattern: "*.pdf"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("dialog error: %w", err)
	}

	if savePath == "" {
		return "", nil // user cancelled
	}

	if err := os.WriteFile(savePath, bytes, 0644); err != nil {
		return "", fmt.Errorf("write error: %w", err)
	}

	return savePath, nil
}

func (h *ExportHandler) PrintPDF(companyID, quotationID string) error {
	// For Print, if we don't have a path, we should save to temp file first
	path, err := h.GenerateTempPDF(companyID, quotationID)
	if err != nil {
		return err
	}
	return h.printService.PrintPDF(path)
}

func (h *ExportHandler) SharePDF(companyID, quotationID string) error {
	path, err := h.GenerateTempPDF(companyID, quotationID)
	if err != nil {
		return err
	}
	return h.shareService.SharePDF(path)
}

func (h *ExportHandler) OpenPDF(companyID, quotationID string) error {
	path, err := h.GenerateTempPDF(companyID, quotationID)
	if err != nil {
		return err
	}
	return h.shareService.OpenPDF(path)
}

func (h *ExportHandler) GenerateTempPDF(companyID, quotationID string) (string, error) {
	bytes, defaultFilename, err := h.exportService.GeneratePDFBytes(h.ctx, companyID, quotationID)
	if err != nil {
		return "", err
	}

	sessionDir, err := os.MkdirTemp(h.paths.TempRoot, "pdf-*")
	if err != nil {
		return "", err
	}
	tempFile := filepath.Join(sessionDir, filepath.Base(defaultFilename))
	if err := os.WriteFile(tempFile, bytes, 0600); err != nil {
		return "", err
	}
	return tempFile, nil
}

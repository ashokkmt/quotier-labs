package wails

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"quotierlabs/backend/application/document"
)

type ExportHandler struct {
	exportService *document.ExportService
	printService  document.PrintService
	shareService  document.ShareService
	ctx           context.Context
}

func NewExportHandler(
	exportService *document.ExportService,
	printService document.PrintService,
	shareService document.ShareService,
) *ExportHandler {
	return &ExportHandler{
		exportService: exportService,
		printService:  printService,
		shareService:  shareService,
	}
}

func (h *ExportHandler) Startup(ctx context.Context) {
	h.ctx = ctx
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

	tempFile := filepath.Join(os.TempDir(), defaultFilename)
	if err := os.WriteFile(tempFile, bytes, 0644); err != nil {
		return "", err
	}
	return tempFile, nil
}

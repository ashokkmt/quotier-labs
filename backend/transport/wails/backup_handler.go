package wails

import (
	"context"
	"fmt"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"quotierlabs/backend/application/backup"
	"quotierlabs/backend/application/company"
	backup_domain "quotierlabs/backend/domain/backup"
	"quotierlabs/backend/infrastructure/export"
	csvimport "quotierlabs/backend/infrastructure/import"
)

type BackupHandler struct {
	backupSvc  *backup.Service
	companySvc *company.Service
	exportSvc  *export.CSVExportService
	importSvc  *csvimport.CSVImportService
	autoBackup *backup.AutoBackupManager
	ctx        context.Context
}

func NewBackupHandler(
	backupSvc *backup.Service,
	companySvc *company.Service,
	exportSvc *export.CSVExportService,
	importSvc *csvimport.CSVImportService,
	autoBackup *backup.AutoBackupManager,
) *BackupHandler {
	return &BackupHandler{
		backupSvc:  backupSvc,
		companySvc: companySvc,
		exportSvc:  exportSvc,
		importSvc:  importSvc,
		autoBackup: autoBackup,
	}
}

func (h *BackupHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

func (h *BackupHandler) getCompanyID() (string, error) {
	comp, err := h.companySvc.GetActiveCompany(h.ctx)
	if err != nil {
		return "", err
	}
	return comp.ID, nil
}

func (h *BackupHandler) CreateBackup() (*backup_domain.BackupInfo, error) {
	// Let user pick directory
	dir, err := wailsRuntime.OpenDirectoryDialog(h.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select Backup Location",
	})
	if err != nil || dir == "" {
		return nil, fmt.Errorf("backup cancelled")
	}

	return h.backupSvc.CreateBackup(h.ctx, dir)
}

func (h *BackupHandler) ValidateBackup() (*backup_domain.ValidationResult, error) {
	// Pick file
	file, err := wailsRuntime.OpenFileDialog(h.ctx, wailsRuntime.OpenDialogOptions{
		Title:   "Select Backup Archive",
		Filters: []wailsRuntime.FileFilter{{DisplayName: "ZIP Archive", Pattern: "*.zip"}},
	})
	if err != nil || file == "" {
		return nil, fmt.Errorf("restore cancelled")
	}

	return h.backupSvc.ValidateBackup(h.ctx, file)
}

func (h *BackupHandler) RestoreBackup(path string) error {
	h.autoBackup.Stop()
	err := h.backupSvc.RestoreBackup(h.ctx, path)
	if err == nil {
		// SQLite has been replaced while closed. A process restart is required so
		// every repository receives a fresh connection to the restored generation.
		wailsRuntime.Quit(h.ctx)
	} else {
		h.autoBackup.Start()
	}
	return err
}

func (h *BackupHandler) GetAutoBackupSettings() (backup.AutoBackupSettings, error) {
	companyID, err := h.getCompanyID()
	if err != nil {
		return backup.AutoBackupSettings{}, err
	}
	return h.backupSvc.GetAutoBackupSettings(h.ctx, companyID), nil
}

func (h *BackupHandler) ChooseAutoBackupDirectory() (backup.AutoBackupSettings, error) {
	dir, err := wailsRuntime.OpenDirectoryDialog(h.ctx, wailsRuntime.OpenDialogOptions{Title: "Choose Automatic Backup Location"})
	if err != nil || dir == "" {
		return backup.AutoBackupSettings{}, fmt.Errorf("backup location selection cancelled")
	}
	companyID, err := h.getCompanyID()
	if err != nil {
		return backup.AutoBackupSettings{}, err
	}
	if err := h.backupSvc.ConfigureAutoBackup(h.ctx, companyID, dir, true); err != nil {
		return backup.AutoBackupSettings{}, err
	}
	return h.backupSvc.GetAutoBackupSettings(h.ctx, companyID), nil
}

func (h *BackupHandler) DisableAutoBackup() error {
	companyID, err := h.getCompanyID()
	if err != nil {
		return err
	}
	current := h.backupSvc.GetAutoBackupSettings(h.ctx, companyID)
	return h.backupSvc.ConfigureAutoBackup(h.ctx, companyID, current.Directory, false)
}

func (h *BackupHandler) ExportQuotations() (*backup_domain.ExportResult, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}

	path, err := wailsRuntime.SaveFileDialog(h.ctx, wailsRuntime.SaveDialogOptions{
		Title:           "Export Quotations",
		DefaultFilename: "quotations_export.csv",
		Filters:         []wailsRuntime.FileFilter{{DisplayName: "CSV", Pattern: "*.csv"}},
	})
	if err != nil || path == "" {
		return nil, fmt.Errorf("cancelled")
	}

	return h.exportSvc.ExportQuotations(h.ctx, compID, path)
}

func (h *BackupHandler) ExportCustomers() (*backup_domain.ExportResult, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return nil, err
	}

	path, err := wailsRuntime.SaveFileDialog(h.ctx, wailsRuntime.SaveDialogOptions{
		Title:           "Export Customers",
		DefaultFilename: "customers_export.csv",
		Filters:         []wailsRuntime.FileFilter{{DisplayName: "CSV", Pattern: "*.csv"}},
	})
	if err != nil || path == "" {
		return nil, fmt.Errorf("cancelled")
	}

	return h.exportSvc.ExportCustomers(h.ctx, compID, path)
}

func (h *BackupHandler) PreviewImport(path string) (*backup_domain.ImportPreview, error) {
	return h.importSvc.PreviewCustomers(path)
}

func (h *BackupHandler) SelectImportFile() (string, error) {
	file, err := wailsRuntime.OpenFileDialog(h.ctx, wailsRuntime.OpenDialogOptions{
		Title:   "Select CSV File",
		Filters: []wailsRuntime.FileFilter{{DisplayName: "CSV", Pattern: "*.csv"}},
	})
	return file, err
}

func (h *BackupHandler) ImportCustomers(path string, mapping backup_domain.ImportMapping) (int, error) {
	compID, err := h.getCompanyID()
	if err != nil {
		return 0, err
	}

	return h.importSvc.ImportCustomers(h.ctx, compID, path, mapping)
}

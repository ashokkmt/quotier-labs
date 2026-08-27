package backup

import "time"

type BackupMetadata struct {
	AppVersion     string    `json:"app_version"`
	SchemaVersion  int       `json:"schema_version"`
	CompanyID      string    `json:"company_id"`
	CompanyName    string    `json:"company_name"`
	CreatedAt      time.Time `json:"created_at"`
	QuotationCount int       `json:"quotation_count"`
	CustomerCount  int       `json:"customer_count"`
}

type BackupInfo struct {
	Path     string         `json:"path"`
	Size     int64          `json:"size"`
	Metadata BackupMetadata `json:"metadata"`
}

type ValidationResult struct {
	IsValid bool           `json:"is_valid"`
	Error   string         `json:"error,omitempty"`
	Info    *BackupInfo    `json:"info,omitempty"`
}

type ExportResult struct {
	Path    string `json:"path"`
	Success bool   `json:"success"`
}

type ImportPreviewRow struct {
	Index   int               `json:"index"`
	Data    map[string]string `json:"data"`
	IsValid bool              `json:"is_valid"`
	Errors  []string          `json:"errors"`
}

type ImportPreview struct {
	Headers []string           `json:"headers"`
	Rows    []ImportPreviewRow `json:"rows"`
	Total   int                `json:"total"`
	Valid   int                `json:"valid"`
}

type ImportMapping struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	Address   string `json:"address"`
	GSTIN     string `json:"gstin"`
	PAN       string `json:"pan"`
}

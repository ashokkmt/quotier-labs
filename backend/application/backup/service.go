package backup

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	appdiagnostics "quotierlabs/backend/application/diagnostics"
	"quotierlabs/backend/domain"
	backup_domain "quotierlabs/backend/domain/backup"
	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
)

type BackupRepo interface {
	CreateBackup(ctx context.Context, destPath string, metadata backup_domain.BackupMetadata, assetsRoot string) (*backup_domain.BackupInfo, error)
	ValidateBackup(ctx context.Context, path string) (*backup_domain.ValidationResult, error)
	RestoreBackup(ctx context.Context, path string, currentDBPath string, assetsRoot string) error
}

type Service struct {
	backupRepo    BackupRepo
	companyRepo   domain.CompanyRepository
	quotationRepo domain.QuotationRepository
	customerRepo  domain.CustomerRepository
	settingsRepo  domain.SettingsRepository
	idGenerator   domain.IDGenerator
	currentDBPath string
	build         appidentity.BuildInfo
	paths         apppaths.Paths
	schemaVersion int64
	recorder      appdiagnostics.Recorder
}

func NewService(
	backupRepo BackupRepo,
	companyRepo domain.CompanyRepository,
	quotationRepo domain.QuotationRepository,
	customerRepo domain.CustomerRepository,
	settingsRepo domain.SettingsRepository,
	idGenerator domain.IDGenerator,
	currentDBPath string,
	build appidentity.BuildInfo,
	paths apppaths.Paths,
	schemaVersion int64,
	recorders ...appdiagnostics.Recorder,
) *Service {
	recorder := appdiagnostics.Recorder(appdiagnostics.NopRecorder{})
	if len(recorders) > 0 && recorders[0] != nil {
		recorder = recorders[0]
	}
	return &Service{
		backupRepo:    backupRepo,
		companyRepo:   companyRepo,
		quotationRepo: quotationRepo,
		customerRepo:  customerRepo,
		settingsRepo:  settingsRepo,
		idGenerator:   idGenerator,
		currentDBPath: currentDBPath,
		build:         build,
		paths:         paths,
		schemaVersion: schemaVersion,
		recorder:      recorder,
	}
}

type AutoBackupSettings struct {
	Enabled       bool   `json:"enabled"`
	Directory     string `json:"directory"`
	LastStatus    string `json:"last_status,omitempty"`
	LastBackupUTC string `json:"last_backup_utc,omitempty"`
}

func (s *Service) GetAutoBackupSettings(ctx context.Context, companyID string) AutoBackupSettings {
	result := AutoBackupSettings{}
	if setting, err := s.settingsRepo.Get(ctx, companyID, "auto_backup_enabled"); err == nil {
		result.Enabled = setting.Value == "true"
	}
	if setting, err := s.settingsRepo.Get(ctx, companyID, "auto_backup_dir"); err == nil {
		result.Directory = setting.Value
	}
	if setting, err := s.settingsRepo.Get(ctx, companyID, "auto_backup_last_status"); err == nil {
		result.LastStatus = setting.Value
	}
	if setting, err := s.settingsRepo.Get(ctx, companyID, "auto_backup_last_utc"); err == nil {
		result.LastBackupUTC = setting.Value
	}
	return result
}

func (s *Service) ConfigureAutoBackup(ctx context.Context, companyID, directory string, enabled bool) error {
	if enabled {
		if !filepath.IsAbs(directory) {
			return fmt.Errorf("automatic backup directory must be absolute")
		}
		info, err := os.Stat(directory)
		if err != nil || !info.IsDir() {
			return fmt.Errorf("automatic backup directory is unavailable")
		}
	}
	now := time.Now().UTC()
	values := []domain.Settings{
		{ID: s.idGenerator.Generate(), CompanyID: companyID, Key: "auto_backup_enabled", Value: fmt.Sprintf("%t", enabled), AuditMetadata: domain.AuditMetadata{CreatedAt: now, UpdatedAt: now, Version: 1}},
		{ID: s.idGenerator.Generate(), CompanyID: companyID, Key: "auto_backup_dir", Value: directory, AuditMetadata: domain.AuditMetadata{CreatedAt: now, UpdatedAt: now, Version: 1}},
	}
	for i := range values {
		if err := s.settingsRepo.Set(ctx, &values[i]); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) CreateBackup(ctx context.Context, destDir string) (info *backup_domain.BackupInfo, err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		s.recorder.RecordOperation(ctx, "backup.create", time.Since(started), result, nil)
	}()
	if strings.TrimSpace(destDir) == "" {
		if s.build.Channel == "development" && s.paths.BackupRoot != "" {
			destDir = s.paths.BackupRoot
		} else {
			return nil, fmt.Errorf("backup location is required")
		}
	}
	if !filepath.IsAbs(destDir) {
		return nil, fmt.Errorf("backup location must be absolute")
	}
	if err := os.MkdirAll(destDir, 0700); err != nil {
		return nil, fmt.Errorf("create backup directory: %w", err)
	}
	comp, err := s.companyRepo.GetActive(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not get active company: %w", err)
	}

	qCount, _ := s.quotationRepo.Count(ctx, comp.ID, domain.QuotationListFilter{})
	customers, _ := s.customerRepo.List(ctx, comp.ID, domain.CustomerListFilter{})
	cCount := len(customers)

	metadata := backup_domain.BackupMetadata{
		FormatVersion:  1,
		AppVersion:     s.build.Version,
		Channel:        s.build.Channel,
		SchemaVersion:  int(s.schemaVersion),
		CompanyID:      comp.ID,
		CompanyName:    comp.Name,
		CreatedAt:      time.Now(),
		QuotationCount: qCount,
		CustomerCount:  cCount,
	}

	filename := fmt.Sprintf("quotierlabs-backup-%s-%s.zip", time.Now().UTC().Format("20060102T150405.000000000Z"), safeFilename(comp.Name))
	destPath := filepath.Join(destDir, filename)

	return s.backupRepo.CreateBackup(ctx, destPath, metadata, s.paths.AssetsRoot())
}

func (s *Service) ValidateBackup(ctx context.Context, path string) (*backup_domain.ValidationResult, error) {
	result, err := s.backupRepo.ValidateBackup(ctx, path)
	if err == nil && result != nil && result.IsValid && result.Info != nil && int64(result.Info.Metadata.SchemaVersion) > s.schemaVersion {
		result.IsValid = false
		result.Error = "This backup was created by a newer Quotier Labs database version. Install that version before restoring it."
	}
	return result, err
}

func (s *Service) RestoreBackup(ctx context.Context, path string) (err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		s.recorder.RecordOperation(ctx, "backup.restore", time.Since(started), result, nil)
	}()
	validation, err := s.ValidateBackup(ctx, path)
	if err != nil {
		return err
	}
	if validation == nil || !validation.IsValid {
		if validation != nil && validation.Error != "" {
			return fmt.Errorf("backup is not restorable: %s", validation.Error)
		}
		return fmt.Errorf("backup is not restorable")
	}
	// A verified application-owned rollback archive is created before the
	// infrastructure layer closes and swaps the live database generation.
	if _, err := s.CreateBackup(ctx, filepath.Join(s.paths.StateRoot, "restore-backups")); err != nil {
		return fmt.Errorf("create pre-restore rollback backup: %w", err)
	}
	return s.backupRepo.RestoreBackup(ctx, path, s.currentDBPath, s.paths.AssetsRoot())
}

func (s *Service) RecordAutoBackupResult(ctx context.Context, companyID string, succeeded bool) {
	now := time.Now().UTC()
	status := "failed"
	if succeeded {
		status = "ok"
	}
	values := []domain.Settings{
		{ID: s.idGenerator.Generate(), CompanyID: companyID, Key: "auto_backup_last_status", Value: status, AuditMetadata: domain.AuditMetadata{CreatedAt: now, UpdatedAt: now, Version: 1}},
	}
	if succeeded {
		values = append(values, domain.Settings{ID: s.idGenerator.Generate(), CompanyID: companyID, Key: "auto_backup_last_utc", Value: now.Format(time.RFC3339), AuditMetadata: domain.AuditMetadata{CreatedAt: now, UpdatedAt: now, Version: 1}})
	}
	for i := range values {
		_ = s.settingsRepo.Set(ctx, &values[i])
	}
}

// PruneAutomaticBackups applies conservative fixed retention only to archives
// that pass Quotier Labs' manifest validation. Unknown files are never removed.
func (s *Service) PruneAutomaticBackups(ctx context.Context, directory string) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return
	}
	type retained struct {
		path string
		info os.FileInfo
	}
	verified := make([]retained, 0)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "quotierlabs-backup-") || !strings.HasSuffix(entry.Name(), ".zip") {
			continue
		}
		path := filepath.Join(directory, entry.Name())
		result, validateErr := s.backupRepo.ValidateBackup(ctx, path)
		info, statErr := entry.Info()
		if validateErr == nil && result != nil && result.IsValid && statErr == nil {
			verified = append(verified, retained{path: path, info: info})
		}
	}
	sort.Slice(verified, func(i, j int) bool { return verified[i].info.ModTime().After(verified[j].info.ModTime()) })
	const maxCount = 12
	const maxAge = 30 * 24 * time.Hour
	const maxBytes = int64(2 << 30)
	var keptBytes int64
	for i, item := range verified {
		keptBytes += item.info.Size()
		if i == 0 {
			continue
		}
		if i >= maxCount || time.Since(item.info.ModTime()) > maxAge || keptBytes > maxBytes {
			_ = os.Remove(item.path)
			keptBytes -= item.info.Size()
		}
	}
}

var unsafeFilename = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

func safeFilename(value string) string {
	value = strings.Trim(unsafeFilename.ReplaceAllString(value, "-"), "-._")
	if value == "" {
		value = "company"
	}
	if len(value) > 48 {
		value = value[:48]
	}
	return value
}

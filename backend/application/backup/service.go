package backup

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"quotierlabs/backend/domain"
	backup_domain "quotierlabs/backend/domain/backup"
)

type BackupRepo interface {
	CreateBackup(ctx context.Context, destPath string, metadata backup_domain.BackupMetadata) (*backup_domain.BackupInfo, error)
	ValidateBackup(ctx context.Context, path string) (*backup_domain.ValidationResult, error)
	RestoreBackup(ctx context.Context, path string, currentDBPath string) error
}

type Service struct {
	backupRepo    BackupRepo
	companyRepo   domain.CompanyRepository
	quotationRepo domain.QuotationRepository
	customerRepo  domain.CustomerRepository
	currentDBPath string
}

func NewService(
	backupRepo BackupRepo,
	companyRepo domain.CompanyRepository,
	quotationRepo domain.QuotationRepository,
	customerRepo domain.CustomerRepository,
	currentDBPath string,
) *Service {
	return &Service{
		backupRepo:    backupRepo,
		companyRepo:   companyRepo,
		quotationRepo: quotationRepo,
		customerRepo:  customerRepo,
		currentDBPath: currentDBPath,
	}
}

func (s *Service) CreateBackup(ctx context.Context, destDir string) (*backup_domain.BackupInfo, error) {
	comp, err := s.companyRepo.GetActive(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not get active company: %w", err)
	}

	qCount, _ := s.quotationRepo.Count(ctx, comp.ID, domain.QuotationListFilter{})
	// Customer count could be added, or skipped
	cCount := 0

	metadata := backup_domain.BackupMetadata{
		AppVersion:     "1.0.0", // Hardcoded for MVP
		SchemaVersion:  9,       // Hardcoded to current goose migration version
		CompanyID:      comp.ID,
		CompanyName:    comp.Name,
		CreatedAt:      time.Now(),
		QuotationCount: qCount,
		CustomerCount:  cCount,
	}

	filename := fmt.Sprintf("quotierlabs_backup_%s_%s.zip", time.Now().Format("20060102_150405"), comp.Name)
	destPath := filepath.Join(destDir, filename)

	return s.backupRepo.CreateBackup(ctx, destPath, metadata)
}

func (s *Service) ValidateBackup(ctx context.Context, path string) (*backup_domain.ValidationResult, error) {
	return s.backupRepo.ValidateBackup(ctx, path)
}

func (s *Service) RestoreBackup(ctx context.Context, path string) error {
	return s.backupRepo.RestoreBackup(ctx, path, s.currentDBPath)
}

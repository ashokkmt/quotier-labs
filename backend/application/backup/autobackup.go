package backup

import (
	"context"
	"time"

	"go.uber.org/zap"
	"quotierlabs/backend/domain"
)

type AutoBackupManager struct {
	logger      *zap.Logger
	backupSvc   *Service
	settingsRepo domain.SettingsRepository
	companyRepo  domain.CompanyRepository
	ctx          context.Context
	cancel       context.CancelFunc
}

func NewAutoBackupManager(
	logger *zap.Logger,
	backupSvc *Service,
	settingsRepo domain.SettingsRepository,
	companyRepo domain.CompanyRepository,
) *AutoBackupManager {
	return &AutoBackupManager{
		logger:       logger,
		backupSvc:    backupSvc,
		settingsRepo: settingsRepo,
		companyRepo:  companyRepo,
	}
}

func (m *AutoBackupManager) Start() {
	m.ctx, m.cancel = context.WithCancel(context.Background())
	
	go func() {
		m.logger.Info("Auto-backup manager started")
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		for {
			select {
			case <-m.ctx.Done():
				m.logger.Info("Auto-backup manager stopped")
				return
			case <-ticker.C:
				m.runBackupIfEnabled()
			}
		}
	}()
}

func (m *AutoBackupManager) Stop() {
	if m.cancel != nil {
		m.cancel()
	}
}

func (m *AutoBackupManager) runBackupIfEnabled() {
	ctx := context.Background()
	comp, err := m.companyRepo.GetActive(ctx)
	if err != nil {
		return
	}

	enabledSet, err := m.settingsRepo.Get(ctx, comp.ID, "auto_backup_enabled")
	if err != nil || enabledSet.Value != "true" {
		return // Not enabled or default off
	}

	dirSet, err := m.settingsRepo.Get(ctx, comp.ID, "auto_backup_dir")
	var backupDir string
	if err == nil && dirSet.Value != "" {
		backupDir = dirSet.Value
	} else {
		// Fallback to current directory
		backupDir = "./backups"
	}

	_, err = m.backupSvc.CreateBackup(ctx, backupDir)
	if err != nil {
		m.logger.Error("auto-backup failed", zap.Error(err))
	} else {
		m.logger.Info("auto-backup completed successfully")
	}
}

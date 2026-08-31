package backup

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
	"quotierlabs/backend/domain"
)

type AutoBackupManager struct {
	logger       *zap.Logger
	backupSvc    *Service
	settingsRepo domain.SettingsRepository
	companyRepo  domain.CompanyRepository
	mu           sync.Mutex
	wg           sync.WaitGroup
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
	m.mu.Lock()
	if m.cancel != nil {
		m.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.wg.Add(1)
	m.mu.Unlock()

	go func() {
		defer m.wg.Done()
		m.logger.Info("Auto-backup manager started")
		ticker := time.NewTicker(1 * time.Hour)
		startup := time.NewTimer(30 * time.Second)
		defer ticker.Stop()
		defer startup.Stop()

		for {
			select {
			case <-ctx.Done():
				m.logger.Info("Auto-backup manager stopped")
				return
			case <-startup.C:
				m.runBackupIfEnabled(ctx)
			case <-ticker.C:
				m.runBackupIfEnabled(ctx)
			}
		}
	}()
}

func (m *AutoBackupManager) Stop() {
	m.mu.Lock()
	cancel := m.cancel
	m.cancel = nil
	if cancel != nil {
		cancel()
		m.wg.Wait()
	}
	m.mu.Unlock()
}

func (m *AutoBackupManager) runBackupIfEnabled(ctx context.Context) {
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
	}

	_, err = m.backupSvc.CreateBackup(ctx, backupDir)
	if err != nil {
		m.backupSvc.RecordAutoBackupResult(ctx, comp.ID, false)
		m.logger.Error("auto-backup failed", zap.String("error_class", "destination-or-snapshot-unavailable"))
	} else {
		m.backupSvc.RecordAutoBackupResult(ctx, comp.ID, true)
		m.backupSvc.PruneAutomaticBackups(ctx, backupDir)
		m.logger.Info("auto-backup completed successfully")
	}
}

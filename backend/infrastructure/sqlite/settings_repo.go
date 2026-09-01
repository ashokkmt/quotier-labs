package sqlite

import (
	"context"

	"gorm.io/gorm"
	"quotierlabs/backend/domain"
)

type SettingsRepository struct {
	db *gorm.DB
}

func NewSettingsRepository(db *gorm.DB) domain.SettingsRepository {
	return &SettingsRepository{db: db}
}

func (r *SettingsRepository) Get(ctx context.Context, companyID string, key string) (*domain.Settings, error) {
	var s domain.Settings
	result := GetDB(ctx, r.db).Where("company_id = ? AND key = ?", companyID, key).Limit(1).Find(&s)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		// Optional settings (including automatic-backup preferences) are absent
		// after a fresh install. That is an expected default, not a database
		// failure that should be emitted by GORM's SQL logger.
		return nil, domain.ErrNotFound
	}
	return &s, nil
}

func (r *SettingsRepository) Set(ctx context.Context, setting *domain.Settings) error {
	var existing domain.Settings
	db := GetDB(ctx, r.db)
	result := db.Where("company_id = ? AND key = ?", setting.CompanyID, setting.Key).Limit(1).Find(&existing)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return db.Create(setting).Error
	}

	existing.Value = setting.Value
	return db.Save(&existing).Error
}

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
	if err := r.db.WithContext(ctx).Where("company_id = ? AND key = ?", companyID, key).First(&s).Error; err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *SettingsRepository) Set(ctx context.Context, setting *domain.Settings) error {
	var existing domain.Settings
	err := r.db.WithContext(ctx).Where("company_id = ? AND key = ?", setting.CompanyID, setting.Key).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		return r.db.WithContext(ctx).Create(setting).Error
	} else if err != nil {
		return err
	}
	
	existing.Value = setting.Value
	return r.db.WithContext(ctx).Save(&existing).Error
}

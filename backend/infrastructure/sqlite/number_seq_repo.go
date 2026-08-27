package sqlite

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"quotierlabs/backend/domain"
)

type NumberSequenceModel struct {
	ID           string `gorm:"primaryKey"`
	CompanyID    string
	DocumentType string
	Prefix       string
	Pattern      string
	CurrentValue int
	Year         int
	CreatedAt    time.Time
	UpdatedAt    time.Time
	CreatedBy    *string
	UpdatedBy    *string
	Version      int
	DeletedAt    gorm.DeletedAt `gorm:"index"`
}

func (NumberSequenceModel) TableName() string {
	return "number_sequences"
}

func toDomainNumberSequence(m *NumberSequenceModel) *domain.NumberSequence {
	if m == nil {
		return nil
	}
	var deletedAt *time.Time
	if m.DeletedAt.Valid {
		deletedAt = &m.DeletedAt.Time
	}
	return &domain.NumberSequence{
		ID:           m.ID,
		CompanyID:    m.CompanyID,
		DocumentType: m.DocumentType,
		Prefix:       m.Prefix,
		Pattern:      m.Pattern,
		CurrentValue: m.CurrentValue,
		Year:         m.Year,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: m.CreatedAt,
			UpdatedAt: m.UpdatedAt,
			CreatedBy: m.CreatedBy,
			UpdatedBy: m.UpdatedBy,
			Version:   m.Version,
			DeletedAt: deletedAt,
		},
	}
}

type numberSequenceRepository struct {
	db *gorm.DB
}

func NewNumberSequenceRepository(db *gorm.DB) domain.NumberSequenceRepository {
	return &numberSequenceRepository{db: db}
}

func (r *numberSequenceRepository) ReserveNext(ctx context.Context, companyID, documentType string, year int) (int, error) {
	db := GetDB(ctx, r.db)
	var model NumberSequenceModel
	
	// Ensure we lock for update if possible. SQLite locks database during writes anyway but let's be explicit
	err := db.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("company_id = ? AND document_type = ? AND year = ?", companyID, documentType, year).
		First(&model).Error

	if err != nil {
		return 0, err
	}

	model.CurrentValue++
	model.Version++
	model.UpdatedAt = time.Now().UTC()

	if err := db.Save(&model).Error; err != nil {
		return 0, err
	}
	return model.CurrentValue, nil
}

func (r *numberSequenceRepository) GetCurrent(ctx context.Context, companyID, documentType string, year int) (*domain.NumberSequence, error) {
	db := GetDB(ctx, r.db)
	var model NumberSequenceModel
	if err := db.Where("company_id = ? AND document_type = ? AND year = ?", companyID, documentType, year).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainNumberSequence(&model), nil
}

func (r *numberSequenceRepository) Create(ctx context.Context, seq *domain.NumberSequence) error {
	db := GetDB(ctx, r.db)
	model := &NumberSequenceModel{
		ID:           seq.ID,
		CompanyID:    seq.CompanyID,
		DocumentType: seq.DocumentType,
		Prefix:       seq.Prefix,
		Pattern:      seq.Pattern,
		CurrentValue: seq.CurrentValue,
		Year:         seq.Year,
		CreatedAt:    seq.CreatedAt,
		UpdatedAt:    seq.UpdatedAt,
		Version:      seq.Version,
	}
	return db.Create(model).Error
}

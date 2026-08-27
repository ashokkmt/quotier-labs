package sqlite

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"quotierlabs/backend/domain"
)

type SectionDefinitionModel struct {
	ID            string `gorm:"primaryKey"`
	CompanyID     *string
	Name          string
	Description   *string
	Schema        string
	SchemaVersion int
	IsBuiltin     bool
	Category      *string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	CreatedBy     *string
	UpdatedBy     *string
	Version       int
	DeletedAt     gorm.DeletedAt `gorm:"index"`
}

func (SectionDefinitionModel) TableName() string {
	return "section_definitions"
}

func toDomainSectionDefinition(m *SectionDefinitionModel) *domain.SectionDefinition {
	if m == nil {
		return nil
	}
	var deletedAt *time.Time
	if m.DeletedAt.Valid {
		deletedAt = &m.DeletedAt.Time
	}
	return &domain.SectionDefinition{
		ID:            m.ID,
		CompanyID:     m.CompanyID,
		Name:          m.Name,
		Description:   m.Description,
		Schema:        m.Schema,
		SchemaVersion: m.SchemaVersion,
		IsBuiltin:     m.IsBuiltin,
		Category:      m.Category,
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

func fromDomainSectionDefinition(d *domain.SectionDefinition) *SectionDefinitionModel {
	if d == nil {
		return nil
	}
	m := &SectionDefinitionModel{
		ID:            d.ID,
		CompanyID:     d.CompanyID,
		Name:          d.Name,
		Description:   d.Description,
		Schema:        d.Schema,
		SchemaVersion: d.SchemaVersion,
		IsBuiltin:     d.IsBuiltin,
		Category:      d.Category,
		CreatedAt:     d.CreatedAt,
		UpdatedAt:     d.UpdatedAt,
		CreatedBy:     d.CreatedBy,
		UpdatedBy:     d.UpdatedBy,
		Version:       d.Version,
	}
	if d.DeletedAt != nil {
		m.DeletedAt = gorm.DeletedAt{Time: *d.DeletedAt, Valid: true}
	}
	return m
}

type sectionDefinitionRepository struct {
	db *gorm.DB
}

func NewSectionDefinitionRepository(db *gorm.DB) domain.SectionDefinitionRepository {
	return &sectionDefinitionRepository{db: db}
}

func (r *sectionDefinitionRepository) Create(ctx context.Context, def *domain.SectionDefinition) error {
	db := GetDB(ctx, r.db)
	model := fromDomainSectionDefinition(def)
	return db.Create(model).Error
}

func (r *sectionDefinitionRepository) Update(ctx context.Context, def *domain.SectionDefinition) error {
	db := GetDB(ctx, r.db)
	model := fromDomainSectionDefinition(def)
	
	query := db.Model(model).Where("id = ? AND version = ?", model.ID, model.Version)
	if model.CompanyID != nil {
		query = query.Where("company_id = ?", *model.CompanyID)
	} else {
		query = query.Where("company_id IS NULL")
	}
	
	res := query.Updates(model)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrConflict
	}
	def.Version++
	return nil
}

func (r *sectionDefinitionRepository) Delete(ctx context.Context, id, companyID string) error {
	db := GetDB(ctx, r.db)
	res := db.Where("id = ? AND company_id = ?", id, companyID).Delete(&SectionDefinitionModel{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *sectionDefinitionRepository) GetByID(ctx context.Context, id string) (*domain.SectionDefinition, error) {
	db := GetDB(ctx, r.db)
	var model SectionDefinitionModel
	if err := db.Where("id = ?", id).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainSectionDefinition(&model), nil
}

func (r *sectionDefinitionRepository) ListByCompany(ctx context.Context, companyID string) ([]domain.SectionDefinition, error) {
	db := GetDB(ctx, r.db)
	var models []SectionDefinitionModel
	if err := db.Where("company_id = ?", companyID).Find(&models).Error; err != nil {
		return nil, err
	}
	result := make([]domain.SectionDefinition, len(models))
	for i, m := range models {
		result[i] = *toDomainSectionDefinition(&m)
	}
	return result, nil
}

func (r *sectionDefinitionRepository) ListBuiltins(ctx context.Context) ([]domain.SectionDefinition, error) {
	db := GetDB(ctx, r.db)
	var models []SectionDefinitionModel
	if err := db.Where("is_builtin = ?", true).Find(&models).Error; err != nil {
		return nil, err
	}
	result := make([]domain.SectionDefinition, len(models))
	for i, m := range models {
		result[i] = *toDomainSectionDefinition(&m)
	}
	return result, nil
}

package sqlite

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"quotierlabs/backend/domain"
)

type TemplateModel struct {
	ID             string `gorm:"primaryKey"`
	CompanyID      *string
	Name           string
	Description    *string
	Layout         string
	SchemaVersion  int
	IsBuiltin      bool
	CurrentVersion int
	CreatedAt      time.Time
	UpdatedAt      time.Time
	CreatedBy      *string
	UpdatedBy      *string
	Version        int
	DeletedAt      gorm.DeletedAt `gorm:"index"`
}

func (TemplateModel) TableName() string {
	return "templates"
}

type TemplateVersionModel struct {
	ID            string `gorm:"primaryKey"`
	TemplateID    string
	Version       int
	Layout        string
	SchemaVersion int
	CreatedAt     time.Time
}

func (TemplateVersionModel) TableName() string {
	return "template_versions"
}

func toDomainTemplate(m *TemplateModel) *domain.Template {
	if m == nil {
		return nil
	}
	var deletedAt *time.Time
	if m.DeletedAt.Valid {
		deletedAt = &m.DeletedAt.Time
	}
	return &domain.Template{
		ID:             m.ID,
		CompanyID:      m.CompanyID,
		Name:           m.Name,
		Description:    m.Description,
		Layout:         m.Layout,
		SchemaVersion:  m.SchemaVersion,
		IsBuiltin:      m.IsBuiltin,
		CurrentVersion: m.CurrentVersion,
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

func fromDomainTemplate(d *domain.Template) *TemplateModel {
	if d == nil {
		return nil
	}
	m := &TemplateModel{
		ID:             d.ID,
		CompanyID:      d.CompanyID,
		Name:           d.Name,
		Description:    d.Description,
		Layout:         d.Layout,
		SchemaVersion:  d.SchemaVersion,
		IsBuiltin:      d.IsBuiltin,
		CurrentVersion: d.CurrentVersion,
		CreatedAt:      d.CreatedAt,
		UpdatedAt:      d.UpdatedAt,
		CreatedBy:      d.CreatedBy,
		UpdatedBy:      d.UpdatedBy,
		Version:        d.Version,
	}
	if d.DeletedAt != nil {
		m.DeletedAt = gorm.DeletedAt{Time: *d.DeletedAt, Valid: true}
	}
	return m
}

func fromDomainTemplateVersion(d *domain.TemplateVersion) *TemplateVersionModel {
	if d == nil {
		return nil
	}
	return &TemplateVersionModel{
		ID:            d.ID,
		TemplateID:    d.TemplateID,
		Version:       d.Version,
		Layout:        d.Layout,
		SchemaVersion: d.SchemaVersion,
		CreatedAt:     d.CreatedAt,
	}
}

type templateRepository struct {
	db *gorm.DB
}

func NewTemplateRepository(db *gorm.DB) domain.TemplateRepository {
	return &templateRepository{db: db}
}

func (r *templateRepository) Create(ctx context.Context, template *domain.Template) error {
	db := GetDB(ctx, r.db)
	model := fromDomainTemplate(template)
	return db.Create(model).Error
}

func (r *templateRepository) Update(ctx context.Context, template *domain.Template) error {
	db := GetDB(ctx, r.db)
	model := fromDomainTemplate(template)

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
	template.Version++
	return nil
}

func (r *templateRepository) Delete(ctx context.Context, id, companyID string) error {
	db := GetDB(ctx, r.db)
	res := db.Where("id = ? AND company_id = ?", id, companyID).Delete(&TemplateModel{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *templateRepository) GetByID(ctx context.Context, id string) (*domain.Template, error) {
	db := GetDB(ctx, r.db)
	var model TemplateModel
	if err := db.Where("id = ?", id).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainTemplate(&model), nil
}

func (r *templateRepository) ListByCompany(ctx context.Context, companyID string) ([]domain.Template, error) {
	db := GetDB(ctx, r.db)
	var models []TemplateModel
	if err := db.Where("company_id = ?", companyID).Find(&models).Error; err != nil {
		return nil, err
	}
	result := make([]domain.Template, len(models))
	for i, m := range models {
		result[i] = *toDomainTemplate(&m)
	}
	return result, nil
}

func (r *templateRepository) ListBuiltins(ctx context.Context) ([]domain.Template, error) {
	db := GetDB(ctx, r.db)
	var models []TemplateModel
	if err := db.Where("is_builtin = ?", true).Find(&models).Error; err != nil {
		return nil, err
	}
	result := make([]domain.Template, len(models))
	for i, m := range models {
		result[i] = *toDomainTemplate(&m)
	}
	return result, nil
}

func (r *templateRepository) CreateVersion(ctx context.Context, version *domain.TemplateVersion) error {
	db := GetDB(ctx, r.db)
	model := fromDomainTemplateVersion(version)
	return db.Create(model).Error
}

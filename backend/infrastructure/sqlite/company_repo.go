package sqlite

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"quotierlabs/backend/domain"
)

type CompanyModel struct {
	ID           string `gorm:"primaryKey"`
	Name         string
	LegalName    *string
	TaxID        *string
	Address      *string
	Phone        *string
	Email        *string
	Website      *string
	LogoURL      *string
	State        *string
	GSTIN        *string
	PAN          *string
	BankDetails  *string
	SignatureURL *string
	StampURL     *string

	Currency  string
	IsActive  bool
	CreatedAt time.Time
	UpdatedAt time.Time
	CreatedBy *string
	UpdatedBy *string
	Version   int
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (CompanyModel) TableName() string {
	return "companies"
}

func toDomainCompany(m *CompanyModel) *domain.Company {
	if m == nil {
		return nil
	}
	var deletedAt *time.Time
	if m.DeletedAt.Valid {
		deletedAt = &m.DeletedAt.Time
	}
	return &domain.Company{
		ID:           m.ID,
		Name:         m.Name,
		LegalName:    m.LegalName,
		TaxID:        m.TaxID,
		Address:      m.Address,
		Phone:        m.Phone,
		Email:        m.Email,
		Website:      m.Website,
		LogoURL:      m.LogoURL,
		State:        m.State,
		GSTIN:        m.GSTIN,
		PAN:          m.PAN,
		BankDetails:  m.BankDetails,
		SignatureURL: m.SignatureURL,
		StampURL:     m.StampURL,

		Currency: m.Currency,
		IsActive: m.IsActive,
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

func fromDomainCompany(d *domain.Company) *CompanyModel {
	if d == nil {
		return nil
	}
	m := &CompanyModel{
		ID:           d.ID,
		Name:         d.Name,
		LegalName:    d.LegalName,
		TaxID:        d.TaxID,
		Address:      d.Address,
		Phone:        d.Phone,
		Email:        d.Email,
		Website:      d.Website,
		LogoURL:      d.LogoURL,
		State:        d.State,
		GSTIN:        d.GSTIN,
		PAN:          d.PAN,
		BankDetails:  d.BankDetails,
		SignatureURL: d.SignatureURL,
		StampURL:     d.StampURL,

		Currency:  d.Currency,
		IsActive:  d.IsActive,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
		CreatedBy: d.CreatedBy,
		UpdatedBy: d.UpdatedBy,
		Version:   d.Version,
	}
	if d.DeletedAt != nil {
		m.DeletedAt = gorm.DeletedAt{Time: *d.DeletedAt, Valid: true}
	}
	return m
}

type companyRepository struct {
	db *gorm.DB
}

func NewCompanyRepository(db *gorm.DB) domain.CompanyRepository {
	return &companyRepository{db: db}
}

func (r *companyRepository) Create(ctx context.Context, company *domain.Company) error {
	db := GetDB(ctx, r.db)
	model := fromDomainCompany(company)
	return db.Create(model).Error
}

func (r *companyRepository) Update(ctx context.Context, company *domain.Company) error {
	db := GetDB(ctx, r.db)
	model := fromDomainCompany(company)
	res := db.Model(&CompanyModel{}).Where("id = ? AND version = ?", model.ID, model.Version).Updates(map[string]interface{}{
		"name":          model.Name,
		"legal_name":    model.LegalName,
		"tax_id":        model.TaxID,
		"address":       model.Address,
		"phone":         model.Phone,
		"email":         model.Email,
		"website":       model.Website,
		"logo_url":      model.LogoURL,
		"state":         model.State,
		"gstin":         model.GSTIN,
		"pan":           model.PAN,
		"bank_details":  model.BankDetails,
		"signature_url": model.SignatureURL,
		"stamp_url":     model.StampURL,
		"currency":      model.Currency,
		"is_active":     model.IsActive,
		"updated_at":    model.UpdatedAt,
		"updated_by":    model.UpdatedBy,
		"version":       gorm.Expr("version + 1"),
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrConflict
	}
	company.Version++ // Increment domain version on success
	return nil
}

func (r *companyRepository) GetActive(ctx context.Context) (*domain.Company, error) {
	db := GetDB(ctx, r.db)
	var model CompanyModel
	if err := db.Where("is_active = ?", true).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainCompany(&model), nil
}

func (r *companyRepository) GetByID(ctx context.Context, id string) (*domain.Company, error) {
	db := GetDB(ctx, r.db)
	var model CompanyModel
	if err := db.First(&model, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainCompany(&model), nil
}

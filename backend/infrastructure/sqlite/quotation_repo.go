package sqlite

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"quotierlabs/backend/domain"
)

type QuotationModel struct {
	ID               string `gorm:"primaryKey"`
	CompanyID        string
	TemplateID       string
	CustomerID       string
	Number           string
	Status           string
	Document         string
	CompanySnapshot  *string
	CustomerSnapshot *string
	TemplateSnapshot *string
	Subtotal         int64
	DiscountTotal    int64
	TaxableTotal     int64
	CGSTTotal        int64
	SGSTTotal        int64
	IGSTTotal        int64
	GrandTotal       int64
	ValidUntil       *time.Time
	Notes            *string
	SchemaVersion    int
	CreatedAt        time.Time
	UpdatedAt        time.Time
	CreatedBy        *string
	UpdatedBy        *string
	Version          int
	DeletedAt        gorm.DeletedAt `gorm:"index"`
}

func (QuotationModel) TableName() string {
	return "quotations"
}

func toDomainQuotation(m *QuotationModel) *domain.Quotation {
	if m == nil {
		return nil
	}
	var deletedAt *time.Time
	if m.DeletedAt.Valid {
		deletedAt = &m.DeletedAt.Time
	}
	return &domain.Quotation{
		ID:               m.ID,
		CompanyID:        m.CompanyID,
		TemplateID:       m.TemplateID,
		CustomerID:       m.CustomerID,
		Number:           m.Number,
		Status:           m.Status,
		Document:         m.Document,
		CompanySnapshot:  m.CompanySnapshot,
		CustomerSnapshot: m.CustomerSnapshot,
		TemplateSnapshot: m.TemplateSnapshot,
		Subtotal:         m.Subtotal,
		DiscountTotal:    m.DiscountTotal,
		TaxableTotal:     m.TaxableTotal,
		CGSTTotal:        m.CGSTTotal,
		SGSTTotal:        m.SGSTTotal,
		IGSTTotal:        m.IGSTTotal,
		GrandTotal:       m.GrandTotal,
		ValidUntil:       m.ValidUntil,
		Notes:            m.Notes,
		SchemaVersion:    m.SchemaVersion,
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

func fromDomainQuotation(d *domain.Quotation) *QuotationModel {
	if d == nil {
		return nil
	}
	m := &QuotationModel{
		ID:               d.ID,
		CompanyID:        d.CompanyID,
		TemplateID:       d.TemplateID,
		CustomerID:       d.CustomerID,
		Number:           d.Number,
		Status:           d.Status,
		Document:         d.Document,
		CompanySnapshot:  d.CompanySnapshot,
		CustomerSnapshot: d.CustomerSnapshot,
		TemplateSnapshot: d.TemplateSnapshot,
		Subtotal:         d.Subtotal,
		DiscountTotal:    d.DiscountTotal,
		TaxableTotal:     d.TaxableTotal,
		CGSTTotal:        d.CGSTTotal,
		SGSTTotal:        d.SGSTTotal,
		IGSTTotal:        d.IGSTTotal,
		GrandTotal:       d.GrandTotal,
		ValidUntil:       d.ValidUntil,
		Notes:            d.Notes,
		SchemaVersion:    d.SchemaVersion,
		CreatedAt:        d.CreatedAt,
		UpdatedAt:        d.UpdatedAt,
		CreatedBy:        d.CreatedBy,
		UpdatedBy:        d.UpdatedBy,
		Version:          d.Version,
	}
	if d.DeletedAt != nil {
		m.DeletedAt = gorm.DeletedAt{Time: *d.DeletedAt, Valid: true}
	}
	return m
}

type quotationRepository struct {
	db *gorm.DB
}

func NewQuotationRepository(db *gorm.DB) domain.QuotationRepository {
	return &quotationRepository{db: db}
}

func (r *quotationRepository) Create(ctx context.Context, quotation *domain.Quotation) error {
	db := GetDB(ctx, r.db)
	model := fromDomainQuotation(quotation)
	return db.Create(model).Error
}

func (r *quotationRepository) Update(ctx context.Context, quotation *domain.Quotation) error {
	db := GetDB(ctx, r.db)
	model := fromDomainQuotation(quotation)
	res := db.Model(model).Where("id = ? AND company_id = ? AND version = ?", model.ID, model.CompanyID, model.Version).Updates(model)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrConflict
	}
	quotation.Version++
	return nil
}

func (r *quotationRepository) GetByID(ctx context.Context, id, companyID string) (*domain.Quotation, error) {
	db := GetDB(ctx, r.db)
	var model QuotationModel
	if err := db.Where("id = ? AND company_id = ?", id, companyID).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainQuotation(&model), nil
}

func (r *quotationRepository) List(ctx context.Context, companyID string, filter domain.QuotationListFilter) ([]domain.Quotation, error) {
	db := GetDB(ctx, r.db)
	var models []QuotationModel
	query := db.Where("company_id = ?", companyID)
	
	if filter.Status != nil {
		query = query.Where("status = ?", *filter.Status)
	}
	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		query = query.Offset(filter.Offset)
	}
	
	if err := query.Order("created_at DESC").Find(&models).Error; err != nil {
		return nil, err
	}
	
	result := make([]domain.Quotation, len(models))
	for i, m := range models {
		result[i] = *toDomainQuotation(&m)
	}
	return result, nil
}

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
	TemplateID       *string
	CustomerID       *string
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

func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
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
		TemplateID:       stringValue(m.TemplateID),
		CustomerID:       stringValue(m.CustomerID),
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
		TemplateID:       nullableString(d.TemplateID),
		CustomerID:       nullableString(d.CustomerID),
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

func (r *quotationRepository) applyFilter(query *gorm.DB, filter domain.QuotationListFilter) *gorm.DB {
	if filter.Status != nil && *filter.Status != "" && *filter.Status != "ALL" {
		query = query.Where("status = ?", *filter.Status)
	}
	if filter.CustomerID != nil && *filter.CustomerID != "" {
		query = query.Where("customer_id = ?", *filter.CustomerID)
	}
	if filter.TemplateID != nil && *filter.TemplateID != "" {
		query = query.Where("template_id = ?", *filter.TemplateID)
	}
	if filter.Search != nil && *filter.Search != "" {
		// Note: To search by customer name cleanly we might need a join or query customer snapshot.
		// For MVP: match by number or simple like on CustomerSnapshot or ID if known.
		// Since we join or want customer name, let's just do an IN query or like on number.
		// We'll use a subquery for customer name or match number.
		searchTerm := "%" + *filter.Search + "%"
		query = query.Where("number LIKE ? OR customer_id IN (SELECT id FROM customers WHERE name LIKE ?)", searchTerm, searchTerm)
	}
	if filter.StartDate != nil {
		query = query.Where("created_at >= ?", *filter.StartDate)
	}
	if filter.EndDate != nil {
		query = query.Where("created_at <= ?", *filter.EndDate)
	}
	return query
}

func (r *quotationRepository) List(ctx context.Context, companyID string, filter domain.QuotationListFilter) ([]domain.Quotation, error) {
	db := GetDB(ctx, r.db)
	var models []QuotationModel
	query := db.Where("company_id = ?", companyID)

	query = r.applyFilter(query, filter)

	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		query = query.Offset(filter.Offset)
	}

	order := "created_at DESC"
	if filter.SortBy != nil {
		dir := "ASC"
		if filter.SortDesc {
			dir = "DESC"
		}
		switch *filter.SortBy {
		case "date":
			order = "created_at " + dir
		case "number":
			order = "number " + dir
		case "amount":
			order = "grand_total " + dir
		case "status":
			order = "status " + dir
		}
	}

	if err := query.Order(order).Find(&models).Error; err != nil {
		return nil, err
	}

	result := make([]domain.Quotation, len(models))
	for i, m := range models {
		result[i] = *toDomainQuotation(&m)
	}
	return result, nil
}

func (r *quotationRepository) Count(ctx context.Context, companyID string, filter domain.QuotationListFilter) (int, error) {
	db := GetDB(ctx, r.db)
	query := db.Model(&QuotationModel{}).Where("company_id = ?", companyID)
	query = r.applyFilter(query, filter)

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, err
	}
	return int(count), nil
}

func (r *quotationRepository) Delete(ctx context.Context, id, companyID string) error {
	db := GetDB(ctx, r.db)
	res := db.Where("id = ? AND company_id = ?", id, companyID).Delete(&QuotationModel{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

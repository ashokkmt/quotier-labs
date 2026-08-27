package sqlite

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"quotierlabs/backend/domain"
)

type CustomerModel struct {
	ID              string `gorm:"primaryKey"`
	CompanyID       string
	Name            string
	CompanyName     *string
	ContactPerson   *string
	Address         *string
	Phone           *string
	Email           *string
	GSTIN           *string
	PAN             *string
	State           *string
	Country         *string
	BillingAddress  *string
	ShippingAddress *string
	Notes           *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
	CreatedBy       *string
	UpdatedBy       *string
	Version         int
	DeletedAt       gorm.DeletedAt `gorm:"index"`
}

func (CustomerModel) TableName() string {
	return "customers"
}

func toDomainCustomer(m *CustomerModel) *domain.Customer {
	if m == nil {
		return nil
	}
	var deletedAt *time.Time
	if m.DeletedAt.Valid {
		deletedAt = &m.DeletedAt.Time
	}
	return &domain.Customer{
		ID:              m.ID,
		CompanyID:       m.CompanyID,
		Name:            m.Name,
		CompanyName:     m.CompanyName,
		ContactPerson:   m.ContactPerson,
		Address:         m.Address,
		Phone:           m.Phone,
		Email:           m.Email,
		GSTIN:           m.GSTIN,
		PAN:             m.PAN,
		State:           m.State,
		Country:         m.Country,
		BillingAddress:  m.BillingAddress,
		ShippingAddress: m.ShippingAddress,
		Notes:           m.Notes,
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

func fromDomainCustomer(d *domain.Customer) *CustomerModel {
	if d == nil {
		return nil
	}
	m := &CustomerModel{
		ID:              d.ID,
		CompanyID:       d.CompanyID,
		Name:            d.Name,
		CompanyName:     d.CompanyName,
		ContactPerson:   d.ContactPerson,
		Address:         d.Address,
		Phone:           d.Phone,
		Email:           d.Email,
		GSTIN:           d.GSTIN,
		PAN:             d.PAN,
		State:           d.State,
		Country:         d.Country,
		BillingAddress:  d.BillingAddress,
		ShippingAddress: d.ShippingAddress,
		Notes:           d.Notes,
		CreatedAt:       d.CreatedAt,
		UpdatedAt:       d.UpdatedAt,
		CreatedBy:       d.CreatedBy,
		UpdatedBy:       d.UpdatedBy,
		Version:         d.Version,
	}
	if d.DeletedAt != nil {
		m.DeletedAt = gorm.DeletedAt{Time: *d.DeletedAt, Valid: true}
	}
	return m
}

type customerRepository struct {
	db *gorm.DB
}

func NewCustomerRepository(db *gorm.DB) domain.CustomerRepository {
	return &customerRepository{db: db}
}

func (r *customerRepository) Create(ctx context.Context, customer *domain.Customer) error {
	db := GetDB(ctx, r.db)
	model := fromDomainCustomer(customer)
	return db.Create(model).Error
}

func (r *customerRepository) Update(ctx context.Context, customer *domain.Customer) error {
	db := GetDB(ctx, r.db)
	model := fromDomainCustomer(customer)
	res := db.Model(model).Where("id = ? AND company_id = ? AND version = ?", model.ID, model.CompanyID, model.Version).Updates(model)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrConflict
	}
	customer.Version++
	return nil
}

func (r *customerRepository) Delete(ctx context.Context, id, companyID string) error {
	db := GetDB(ctx, r.db)
	res := db.Where("id = ? AND company_id = ?", id, companyID).Delete(&CustomerModel{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *customerRepository) GetByID(ctx context.Context, id, companyID string) (*domain.Customer, error) {
	db := GetDB(ctx, r.db)
	var model CustomerModel
	if err := db.Where("id = ? AND company_id = ?", id, companyID).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainCustomer(&model), nil
}

func (r *customerRepository) List(ctx context.Context, companyID string, filter domain.CustomerListFilter) ([]domain.Customer, error) {
	db := GetDB(ctx, r.db)
	var models []CustomerModel
	query := db.Where("company_id = ?", companyID)
	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		query = query.Offset(filter.Offset)
	}
	
	if err := query.Find(&models).Error; err != nil {
		return nil, err
	}
	
	result := make([]domain.Customer, len(models))
	for i, m := range models {
		result[i] = *toDomainCustomer(&m)
	}
	return result, nil
}

func (r *customerRepository) Search(ctx context.Context, companyID, query string) ([]domain.Customer, error) {
	db := GetDB(ctx, r.db)
	var models []CustomerModel
	if err := db.Where("company_id = ? AND name LIKE ?", companyID, "%"+query+"%").Find(&models).Error; err != nil {
		return nil, err
	}
	
	result := make([]domain.Customer, len(models))
	for i, m := range models {
		result[i] = *toDomainCustomer(&m)
	}
	return result, nil
}

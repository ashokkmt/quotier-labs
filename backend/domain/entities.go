package domain

import "time"

type Money struct {
	Amount   int64 // minor units
	Currency string
}

type Company struct {
	ID        string
	Name      string
	LegalName *string
	TaxID     *string
	Address   *string
	Phone     *string
	Email     *string
	Website   *string
	LogoURL   *string
	Currency  string
	IsActive  bool
	AuditMetadata
}

type Settings struct {
	ID        string
	CompanyID string
	Key       string
	Value     string
	AuditMetadata
}

type Customer struct {
	ID              string
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
	AuditMetadata
}

type SectionDefinition struct {
	ID            string
	CompanyID     *string
	Name          string
	Description   *string
	Schema        string
	SchemaVersion int
	IsBuiltin     bool
	Category      *string
	AuditMetadata
}

type Template struct {
	ID             string
	CompanyID      *string
	Name           string
	Description    *string
	Layout         string
	SchemaVersion  int
	IsBuiltin      bool
	CurrentVersion int
	AuditMetadata
}

type TemplateVersion struct {
	ID            string
	TemplateID    string
	Version       int
	Layout        string
	SchemaVersion int
	CreatedAt     time.Time
}

type Quotation struct {
	ID               string
	CompanyID        string
	TemplateID       string
	CustomerID       string
	Number           string
	Status           string // DRAFT, FINALIZED, SENT, ACCEPTED, REJECTED, EXPIRED
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
	AuditMetadata
}

type NumberSequence struct {
	ID           string
	CompanyID    string
	DocumentType string
	Prefix       string
	Pattern      string
	CurrentValue int
	Year         int
	AuditMetadata
}

package quotation

import "time"

type QuotationDTO struct {
	ID               string     `json:"id"`
	CompanyID        string     `json:"company_id"`
	TemplateID       string     `json:"template_id"`
	CustomerID       string     `json:"customer_id"`
	Number           string     `json:"number"`
	Status           string     `json:"status"`
	Document         string     `json:"document"`
	Subtotal         int64      `json:"subtotal"`
	DiscountTotal    int64      `json:"discount_total"`
	TaxableTotal     int64      `json:"taxable_total"`
	CGSTTotal        int64      `json:"cgst_total"`
	SGSTTotal        int64      `json:"sgst_total"`
	IGSTTotal        int64      `json:"igst_total"`
	GrandTotal       int64      `json:"grand_total"`
	ValidUntil       *time.Time `json:"valid_until,omitempty"`
	Notes            *string    `json:"notes,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type QuotationCreateDTO struct {
	TemplateID string `json:"template_id"`
	CustomerID string `json:"customer_id"` // required for MVP
}

type QuotationUpdateDocumentDTO struct {
	ID       string `json:"id"`
	Document string `json:"document"`
}

type QuotationUpdateCustomerDTO struct {
	ID         string `json:"id"`
	CustomerID string `json:"customer_id"`
}

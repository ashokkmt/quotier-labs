package quotation

import "time"

type QuotationSummaryDTO struct {
	ID           string    `json:"id"`
	Number       string    `json:"number"`
	CustomerID   string    `json:"customer_id"`
	CustomerName string    `json:"customer_name"`
	Status       string    `json:"status"`
	GrandTotal   int64     `json:"grand_total"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type QuotationListResponse struct {
	Items []QuotationSummaryDTO `json:"items"`
	Total int                   `json:"total"`
}

type QuotationListFilterDTO struct {
	Limit      int     `json:"limit"`
	Offset     int     `json:"offset"`
	Status     *string `json:"status"`
	CustomerID *string `json:"customer_id"`
	TemplateID *string `json:"template_id"`
	Search     *string `json:"search"`
	StartDate  *string `json:"start_date"`
	EndDate    *string `json:"end_date"`
	SortBy     *string `json:"sort_by"`
	SortDesc   bool    `json:"sort_desc"`
}

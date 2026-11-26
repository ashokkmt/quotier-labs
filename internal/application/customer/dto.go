package customer

type CustomerDTO struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	CompanyName     *string `json:"company_name,omitempty"`
	ContactPerson   *string `json:"contact_person,omitempty"`
	Address         *string `json:"address,omitempty"`
	Phone           *string `json:"phone,omitempty"`
	Email           *string `json:"email,omitempty"`
	GSTIN           *string `json:"gstin,omitempty"`
	PAN             *string `json:"pan,omitempty"`
	State           *string `json:"state,omitempty"`
	Country         *string `json:"country,omitempty"`
	BillingAddress  *string `json:"billing_address,omitempty"`
	ShippingAddress *string `json:"shipping_address,omitempty"`
	Notes           *string `json:"notes,omitempty"`
}

type CustomerCreateDTO struct {
	Name            string  `json:"name"`
	CompanyName     *string `json:"company_name,omitempty"`
	ContactPerson   *string `json:"contact_person,omitempty"`
	Address         *string `json:"address,omitempty"`
	Phone           *string `json:"phone,omitempty"`
	Email           *string `json:"email,omitempty"`
	GSTIN           *string `json:"gstin,omitempty"`
	PAN             *string `json:"pan,omitempty"`
	State           *string `json:"state,omitempty"`
	Country         *string `json:"country,omitempty"`
	BillingAddress  *string `json:"billing_address,omitempty"`
	ShippingAddress *string `json:"shipping_address,omitempty"`
	Notes           *string `json:"notes,omitempty"`
}

type CustomerUpdateDTO struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	CompanyName     *string `json:"company_name,omitempty"`
	ContactPerson   *string `json:"contact_person,omitempty"`
	Address         *string `json:"address,omitempty"`
	Phone           *string `json:"phone,omitempty"`
	Email           *string `json:"email,omitempty"`
	GSTIN           *string `json:"gstin,omitempty"`
	PAN             *string `json:"pan,omitempty"`
	State           *string `json:"state,omitempty"`
	Country         *string `json:"country,omitempty"`
	BillingAddress  *string `json:"billing_address,omitempty"`
	ShippingAddress *string `json:"shipping_address,omitempty"`
	Notes           *string `json:"notes,omitempty"`
}

type CustomerListFilterDTO struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

type CustomerListDTO struct {
	Items []CustomerDTO `json:"items"`
	Total int           `json:"total"`
}

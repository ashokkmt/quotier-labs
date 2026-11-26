package company

type CompanyDTO struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	LegalName    *string `json:"legal_name,omitempty"`
	TaxID        *string `json:"tax_id,omitempty"`
	Address      *string `json:"address,omitempty"`
	Phone        *string `json:"phone,omitempty"`
	Email        *string `json:"email,omitempty"`
	Website      *string `json:"website,omitempty"`
	LogoURL      *string `json:"logo_url,omitempty"`
	State        *string `json:"state,omitempty"`
	GSTIN        *string `json:"gstin,omitempty"`
	PAN          *string `json:"pan,omitempty"`
	BankDetails  *string `json:"bank_details,omitempty"`
	SignatureURL *string `json:"signature_url,omitempty"`
	StampURL     *string `json:"stamp_url,omitempty"`
	Currency     string  `json:"currency"`
	IsActive     bool    `json:"is_active"`
}

type CompanyCreateDTO struct {
	Name         string  `json:"name"`
	LegalName    *string `json:"legal_name,omitempty"`
	TaxID        *string `json:"tax_id,omitempty"`
	Address      *string `json:"address,omitempty"`
	Phone        *string `json:"phone,omitempty"`
	Email        *string `json:"email,omitempty"`
	Website      *string `json:"website,omitempty"`
	LogoURL      *string `json:"logo_url,omitempty"`
	State        *string `json:"state,omitempty"`
	GSTIN        *string `json:"gstin,omitempty"`
	PAN          *string `json:"pan,omitempty"`
	BankDetails  *string `json:"bank_details,omitempty"`
	SignatureURL *string `json:"signature_url,omitempty"`
	StampURL     *string `json:"stamp_url,omitempty"`
	Currency     string  `json:"currency"`
}

type CompanyUpdateDTO struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	LegalName    *string `json:"legal_name,omitempty"`
	TaxID        *string `json:"tax_id,omitempty"`
	Address      *string `json:"address,omitempty"`
	Phone        *string `json:"phone,omitempty"`
	Email        *string `json:"email,omitempty"`
	Website      *string `json:"website,omitempty"`
	LogoURL      *string `json:"logo_url,omitempty"`
	State        *string `json:"state,omitempty"`
	GSTIN        *string `json:"gstin,omitempty"`
	PAN          *string `json:"pan,omitempty"`
	BankDetails  *string `json:"bank_details,omitempty"`
	SignatureURL *string `json:"signature_url,omitempty"`
	StampURL     *string `json:"stamp_url,omitempty"`
	Currency     string  `json:"currency"`
}

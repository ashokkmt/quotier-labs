package flowlayout

import (
	"fmt"
	"time"
)

func resolveBusinessField(key string, input ResolveInput) (string, bool) {
	pointer := func(value *string) (string, bool) {
		if value == nil || *value == "" {
			return "", false
		}
		return *value, true
	}
	switch key {
	case "company.name":
		return value(input.Company != nil, func() string { return input.Company.Name })
	case "company.legal_name":
		if input.Company != nil {
			return pointer(input.Company.LegalName)
		}
	case "company.address":
		if input.Company != nil {
			return pointer(input.Company.Address)
		}
	case "company.phone":
		if input.Company != nil {
			return pointer(input.Company.Phone)
		}
	case "company.email":
		if input.Company != nil {
			return pointer(input.Company.Email)
		}
	case "company.website":
		if input.Company != nil {
			return pointer(input.Company.Website)
		}
	case "company.gstin":
		if input.Company != nil {
			return pointer(input.Company.GSTIN)
		}
	case "company.pan":
		if input.Company != nil {
			return pointer(input.Company.PAN)
		}
	case "customer.name":
		return value(input.Customer != nil, func() string { return input.Customer.Name })
	case "customer.company_name":
		if input.Customer != nil {
			return pointer(input.Customer.CompanyName)
		}
	case "customer.contact_person":
		if input.Customer != nil {
			return pointer(input.Customer.ContactPerson)
		}
	case "customer.address":
		if input.Customer != nil {
			return pointer(input.Customer.Address)
		}
	case "customer.billing_address":
		if input.Customer != nil {
			return pointer(input.Customer.BillingAddress)
		}
	case "customer.shipping_address":
		if input.Customer != nil {
			return pointer(input.Customer.ShippingAddress)
		}
	case "customer.phone":
		if input.Customer != nil {
			return pointer(input.Customer.Phone)
		}
	case "customer.email":
		if input.Customer != nil {
			return pointer(input.Customer.Email)
		}
	case "customer.gstin":
		if input.Customer != nil {
			return pointer(input.Customer.GSTIN)
		}
	case "customer.pan":
		if input.Customer != nil {
			return pointer(input.Customer.PAN)
		}
	case "customer.state":
		if input.Customer != nil {
			return pointer(input.Customer.State)
		}
	case "customer.country":
		if input.Customer != nil {
			return pointer(input.Customer.Country)
		}
	case "quotation.number":
		return value(input.Quotation != nil, func() string { return input.Quotation.Number })
	case "quotation.date":
		return dateValue(input.Quotation != nil, func() time.Time { return input.Quotation.CreatedAt })
	case "quotation.valid_until":
		if input.Quotation != nil && input.Quotation.ValidUntil != nil {
			return input.Quotation.ValidUntil.Format("02 Jan 2006"), true
		}
	case "quotation.subtotal":
		return quoteMoney(input, func() int64 { return input.Quotation.Subtotal })
	case "quotation.discount_total":
		return quoteMoney(input, func() int64 { return input.Quotation.DiscountTotal })
	case "quotation.taxable_total":
		return quoteMoney(input, func() int64 { return input.Quotation.TaxableTotal })
	case "quotation.cgst_total":
		return quoteMoney(input, func() int64 { return input.Quotation.CGSTTotal })
	case "quotation.sgst_total":
		return quoteMoney(input, func() int64 { return input.Quotation.SGSTTotal })
	case "quotation.igst_total":
		return quoteMoney(input, func() int64 { return input.Quotation.IGSTTotal })
	case "quotation.grand_total":
		return quoteMoney(input, func() int64 { return input.Quotation.GrandTotal })
	}
	return "", false
}

func value(ok bool, get func() string) (string, bool) {
	if !ok {
		return "", false
	}
	v := get()
	return v, v != ""
}

func dateValue(ok bool, get func() time.Time) (string, bool) {
	if !ok || get().IsZero() {
		return "", false
	}
	return get().Format("02 Jan 2006"), true
}

func quoteMoney(input ResolveInput, get func() int64) (string, bool) {
	if input.Quotation == nil {
		return "", false
	}
	return fmt.Sprintf("₹%.2f", float64(get())/100), true
}

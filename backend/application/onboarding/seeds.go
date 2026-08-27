package onboarding

import (
	"quotierlabs/backend/domain"
)

var BuiltinSectionDefinitions = []domain.SectionDefinition{
	{
		Name:          "Company Header",
		Description:   func(s string) *string { return &s }("Displays company logo, name, and contact details"),
		Schema:        `{"fields": [{"name": "show_logo", "type": "boolean", "default": true}]}`,
		SchemaVersion: 1,
		IsBuiltin:     true,
		Category:      func(s string) *string { return &s }("Header"),
	},
	{
		Name:          "Customer Details",
		Description:   func(s string) *string { return &s }("Displays customer billing and shipping address"),
		Schema:        `{"fields": [{"name": "show_shipping", "type": "boolean", "default": false}]}`,
		SchemaVersion: 1,
		IsBuiltin:     true,
		Category:      func(s string) *string { return &s }("Customer"),
	},
	{
		Name:          "Product Table",
		Description:   func(s string) *string { return &s }("Main line items table with quantities and prices"),
		Schema:        `{"fields": [{"name": "show_discount", "type": "boolean", "default": false}]}`,
		SchemaVersion: 1,
		IsBuiltin:     true,
		Category:      func(s string) *string { return &s }("Table"),
	},
	{
		Name:          "Notes",
		Description:   func(s string) *string { return &s }("Freeform text notes"),
		Schema:        `{"fields": [{"name": "content", "type": "text", "default": ""}]}`,
		SchemaVersion: 1,
		IsBuiltin:     true,
		Category:      func(s string) *string { return &s }("Text"),
	},
	{
		Name:          "Payment Terms",
		Description:   func(s string) *string { return &s }("Standard payment terms"),
		Schema:        `{"fields": [{"name": "content", "type": "text", "default": "100% advance payment required."}]}`,
		SchemaVersion: 1,
		IsBuiltin:     true,
		Category:      func(s string) *string { return &s }("Terms"),
	},
	{
		Name:          "Bank Details",
		Description:   func(s string) *string { return &s }("Company bank account details for payment"),
		Schema:        `{"fields": [{"name": "show_upi", "type": "boolean", "default": true}]}`,
		SchemaVersion: 1,
		IsBuiltin:     true,
		Category:      func(s string) *string { return &s }("Payment"),
	},
	{
		Name:          "Signature & Stamp",
		Description:   func(s string) *string { return &s }("Authorized signatory block"),
		Schema:        `{"fields": [{"name": "show_stamp", "type": "boolean", "default": true}]}`,
		SchemaVersion: 1,
		IsBuiltin:     true,
		Category:      func(s string) *string { return &s }("Footer"),
	},
}

var BuiltinTemplates = []domain.Template{
	{
		Name:           "Standard Quotation",
		Description:    func(s string) *string { return &s }("Clean, professional standard layout"),
		Layout:         `{"sections": ["Company Header", "Customer Details", "Product Table", "Notes", "Payment Terms", "Bank Details", "Signature & Stamp"]}`,
		SchemaVersion:  1,
		IsBuiltin:      true,
		CurrentVersion: 1,
	},
}

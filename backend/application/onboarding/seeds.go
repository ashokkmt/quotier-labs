package onboarding

import (
	"encoding/json"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/documentv6"
)

func blankBuiltinLayout() string {
	raw, err := json.Marshal(documentmodel.NewBlank("builtin-standard-page"))
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func v6StarterLayout() string {
	raw, err := json.Marshal(documentv6.NewStarterQuotation())
	if err != nil {
		panic(err)
	}
	return string(raw)
}

var BuiltinTemplates = []domain.Template{
	{
		Name:           "Standard Quotation",
		Description:    func(s string) *string { return &s }("Clean, professional standard layout"),
		Layout:         blankBuiltinLayout(),
		SchemaVersion:  documentmodel.SchemaVersion,
		IsBuiltin:      true,
		CurrentVersion: 1,
	},
	{
		Name:           "Modern V6 Quotation",
		Description:    func(s string) *string { return &s }("Flowing quotation with business fields and configurable line items"),
		Layout:         v6StarterLayout(),
		SchemaVersion:  documentv6.SchemaVersion,
		IsBuiltin:      true,
		CurrentVersion: 1,
	},
}

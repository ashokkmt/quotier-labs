package onboarding

import (
	"encoding/json"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
)

func blankBuiltinLayout() string {
	raw, err := json.Marshal(documentmodel.NewBlank("builtin-standard-page"))
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
}

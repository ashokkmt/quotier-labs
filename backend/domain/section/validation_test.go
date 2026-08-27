package section_test

import (
	"testing"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/section"
)

func TestValidateSectionDefinition(t *testing.T) {
	tests := []struct {
		name    string
		def     domain.SectionDefinition
		wantErr error
	}{
		{
			name: "valid basic section",
			def: domain.SectionDefinition{
				Name:   "Client Details",
				Schema: `{"elements":[]}`,
			},
			wantErr: nil,
		},
		{
			name: "missing name",
			def: domain.SectionDefinition{
				Name:   "",
				Schema: `{"elements":[]}`,
			},
			wantErr: section.ErrNameRequired,
		},
		{
			name: "invalid json schema",
			def: domain.SectionDefinition{
				Name:   "Test",
				Schema: `{invalid}`,
			},
			wantErr: section.ErrInvalidSchema,
		},
		{
			name: "valid schema with fields",
			def: domain.SectionDefinition{
				Name: "Test",
				Schema: `{"elements":[{"element_type":"Field","field":{"id":"f1","label":"L1","type":"Text"}}]}`,
			},
			wantErr: nil,
		},
		{
			name: "invalid field type",
			def: domain.SectionDefinition{
				Name: "Test",
				Schema: `{"elements":[{"element_type":"Field","field":{"id":"f1","label":"L1","type":"Unknown"}}]}`,
			},
			wantErr: nil, // We'll assert this properly below
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := section.ValidateSectionDefinition(&tt.def)
			if tt.name == "invalid field type" {
				if err == nil {
					t.Errorf("expected error for invalid field type, got nil")
				}
				return
			}
			if err != tt.wantErr {
				t.Errorf("expected error %v, got %v", tt.wantErr, err)
			}
		})
	}
}

package template_test

import (
	"testing"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/template"
)

func TestValidateTemplate(t *testing.T) {
	tests := []struct {
		name    string
		tmpl    domain.Template
		wantErr error
	}{
		{
			name: "valid basic template",
			tmpl: domain.Template{
				Name:   "Standard",
				Layout: `{"rows":[]}`,
			},
			wantErr: nil,
		},
		{
			name: "missing name",
			tmpl: domain.Template{
				Name:   "",
				Layout: `{"rows":[]}`,
			},
			wantErr: template.ErrNameRequired,
		},
		{
			name: "invalid layout json",
			tmpl: domain.Template{
				Name:   "Test",
				Layout: `{invalid}`,
			},
			wantErr: template.ErrInvalidLayout,
		},
		{
			name: "invalid layout schema",
			tmpl: domain.Template{
				Name: "Test",
				Layout: `{"rows":[{"id":"","columns":[]}]}`,
			},
			wantErr: nil, // We'll assert error exists
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := template.ValidateTemplate(&tt.tmpl)
			if tt.name == "invalid layout schema" {
				if err == nil {
					t.Errorf("expected error for invalid layout schema")
				}
				return
			}
			if err != tt.wantErr {
				t.Errorf("expected error %v, got %v", tt.wantErr, err)
			}
		})
	}
}

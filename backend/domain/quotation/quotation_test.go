package quotation_test

import (
	"context"
	"testing"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/quotation"
)

type mockSectionRepo struct {
	sections map[string]*domain.SectionDefinition
}

func (m *mockSectionRepo) Create(ctx context.Context, def *domain.SectionDefinition) error { return nil }
func (m *mockSectionRepo) Update(ctx context.Context, def *domain.SectionDefinition) error { return nil }
func (m *mockSectionRepo) Delete(ctx context.Context, id, companyID string) error { return nil }
func (m *mockSectionRepo) ListByCompany(ctx context.Context, companyID string) ([]domain.SectionDefinition, error) { return nil, nil }
func (m *mockSectionRepo) ListBuiltins(ctx context.Context) ([]domain.SectionDefinition, error) { return nil, nil }
func (m *mockSectionRepo) GetByID(ctx context.Context, id string) (*domain.SectionDefinition, error) {
	if s, ok := m.sections[id]; ok {
		return s, nil
	}
	return nil, domain.ErrNotFound
}

func TestQuotationValidation(t *testing.T) {
	tests := []struct {
		name    string
		q       domain.Quotation
		wantErr error
	}{
		{
			name: "valid draft",
			q: domain.Quotation{
				Status: quotation.StatusDraft,
				Document: `{"rows":[]}`,
			},
			wantErr: nil,
		},
		{
			name: "invalid status",
			q: domain.Quotation{
				Status: "UNKNOWN",
			},
			wantErr: quotation.ErrInvalidStatus,
		},
		{
			name: "invalid document json",
			q: domain.Quotation{
				Status: quotation.StatusDraft,
				Document: `{invalid}`,
			},
			wantErr: quotation.ErrInvalidDocument,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := quotation.ValidateQuotation(&tt.q)
			if err != tt.wantErr {
				t.Errorf("expected error %v, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestTemplateResolver(t *testing.T) {
	mockRepo := &mockSectionRepo{
		sections: map[string]*domain.SectionDefinition{
			"sec-1": {
				ID: "sec-1",
				Name: "Client Details",
				Schema: `{"elements":[{"element_type":"Field","field":{"id":"f1","label":"Name","type":"Text","default_value":"N/A"}}]}`,
			},
		},
	}
	resolver := quotation.NewTemplateResolver(mockRepo)

	tmpl := &domain.Template{
		Layout: `{"rows":[{"id":"r1","order":0,"columns":[{"id":"c1","order":0,"width":"100%","sections":[{"id":"inst1","section_definition_id":"sec-1","title_override":"Overridden Title","visibility":true,"optional":false,"field_overrides":{"f1":"Custom Value"}}]}]}]}`,
	}

	doc, err := resolver.Resolve(context.Background(), tmpl)
	if err != nil {
		t.Fatalf("resolve failed: %v", err)
	}

	if len(doc.Rows) != 1 {
		t.Fatalf("expected 1 row")
	}
	sec := doc.Rows[0].Columns[0].Sections[0]
	if sec.Title != "Overridden Title" {
		t.Errorf("expected title override, got %s", sec.Title)
	}
	if len(sec.Fields) != 1 {
		t.Fatalf("expected 1 field")
	}
	if sec.Fields[0].Value != "Custom Value" {
		t.Errorf("expected field override, got %v", sec.Fields[0].Value)
	}
}

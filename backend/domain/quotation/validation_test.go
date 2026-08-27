package quotation_test

import (
	"testing"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/quotation"
)

func TestValidateQuotation(t *testing.T) {
	tests := []struct {
		name    string
		q       *domain.Quotation
		wantErr bool
	}{
		{
			name: "valid draft",
			q: &domain.Quotation{
				Status: string(quotation.StatusDraft),
			},
			wantErr: false,
		},
		{
			name: "invalid status",
			q: &domain.Quotation{
				Status: "UNKNOWN",
			},
			wantErr: true,
		},
		{
			name: "valid with document",
			q: &domain.Quotation{
				Status: string(quotation.StatusDraft),
				Document: `{"sections":[]}`,
			},
			wantErr: false,
		},
		{
			name: "invalid document json",
			q: &domain.Quotation{
				Status: string(quotation.StatusDraft),
				Document: `{bad json`,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := quotation.ValidateQuotation(tt.q)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateQuotation() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

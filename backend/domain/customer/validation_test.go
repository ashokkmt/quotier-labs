package customer_test

import (
	"testing"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/customer"
)

func ptr(s string) *string {
	return &s
}

func TestValidateCustomer(t *testing.T) {
	tests := []struct {
		name     string
		customer domain.Customer
		wantErr  error
	}{
		{
			name: "valid basic customer",
			customer: domain.Customer{
				Name: "Acme Corp",
			},
			wantErr: nil,
		},
		{
			name: "missing name",
			customer: domain.Customer{
				Name: "",
			},
			wantErr: customer.ErrNameRequired,
		},
		{
			name: "valid email",
			customer: domain.Customer{
				Name:  "Test",
				Email: ptr("test@example.com"),
			},
			wantErr: nil,
		},
		{
			name: "invalid email",
			customer: domain.Customer{
				Name:  "Test",
				Email: ptr("invalid-email"),
			},
			wantErr: customer.ErrInvalidEmail,
		},
		{
			name: "valid gstin",
			customer: domain.Customer{
				Name:  "Test",
				GSTIN: ptr("27ABCDE1234F1Z5"),
			},
			wantErr: nil,
		},
		{
			name: "invalid gstin",
			customer: domain.Customer{
				Name:  "Test",
				GSTIN: ptr("INVALID-GSTIN"),
			},
			wantErr: customer.ErrInvalidGSTIN,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := customer.ValidateCustomer(&tt.customer)
			if err != tt.wantErr {
				t.Errorf("expected error %v, got %v", tt.wantErr, err)
			}
		})
	}
}

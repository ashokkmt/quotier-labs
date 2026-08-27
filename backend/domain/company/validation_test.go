package company_test

import (
	"testing"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/company"
)

func TestValidateCompany(t *testing.T) {
	state := "Maharashtra"
	c := &domain.Company{
		Name:  "Quotier",
		State: &state,
	}

	err := company.ValidateCompany(c)
	if err != nil {
		t.Fatalf("expected valid company, got %v", err)
	}
	if c.Currency != "INR" {
		t.Fatalf("expected default currency INR, got %v", c.Currency)
	}

	c.Name = ""
	err = company.ValidateCompany(c)
	if err != company.ErrNameRequired {
		t.Fatalf("expected ErrNameRequired, got %v", err)
	}
	c.Name = "Quotier"

	c.State = nil
	err = company.ValidateCompany(c)
	if err != company.ErrStateRequired {
		t.Fatalf("expected ErrStateRequired, got %v", err)
	}
	c.State = &state

	invalidGSTIN := "123"
	c.GSTIN = &invalidGSTIN
	err = company.ValidateCompany(c)
	if err != company.ErrInvalidGSTIN {
		t.Fatalf("expected ErrInvalidGSTIN, got %v", err)
	}
	
	validGSTIN := "27ABCDE1234F1Z5"
	c.GSTIN = &validGSTIN
	err = company.ValidateCompany(c)
	if err != nil {
		t.Fatalf("expected valid GSTIN to pass, got %v", err)
	}

	invalidEmail := "test@"
	c.Email = &invalidEmail
	err = company.ValidateCompany(c)
	if err != company.ErrInvalidEmail {
		t.Fatalf("expected ErrInvalidEmail, got %v", err)
	}

	validEmail := "test@example.com"
	c.Email = &validEmail
	err = company.ValidateCompany(c)
	if err != nil {
		t.Fatalf("expected valid email to pass, got %v", err)
	}
}

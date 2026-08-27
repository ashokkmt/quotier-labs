package company

import (
	"errors"
	"regexp"

	"quotierlabs/backend/domain"
)

var (
	ErrNameRequired  = errors.New("company name is required")
	ErrStateRequired = errors.New("state (place of supply) is required")
	ErrInvalidGSTIN  = errors.New("invalid GSTIN format")
	ErrInvalidEmail  = errors.New("invalid email format")
)

var (
	gstinRegex = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`)
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
)

func ValidateCompany(c *domain.Company) error {
	if c.Name == "" {
		return ErrNameRequired
	}
	if c.State == nil || *c.State == "" {
		return ErrStateRequired
	}

	if c.GSTIN != nil && *c.GSTIN != "" {
		if !gstinRegex.MatchString(*c.GSTIN) {
			return ErrInvalidGSTIN
		}
	}

	if c.Email != nil && *c.Email != "" {
		if !emailRegex.MatchString(*c.Email) {
			return ErrInvalidEmail
		}
	}

	if c.Currency == "" {
		c.Currency = "INR"
	}

	return nil
}

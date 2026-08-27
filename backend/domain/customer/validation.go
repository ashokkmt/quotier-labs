package customer

import (
	"errors"
	"regexp"

	"quotierlabs/backend/domain"
)

var (
	ErrNameRequired = errors.New("customer name is required")
	ErrInvalidGSTIN = errors.New("invalid GSTIN format")
	ErrInvalidEmail = errors.New("invalid email format")
)

var (
	gstinRegex = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`)
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
)

func ValidateCustomer(c *domain.Customer) error {
	if c.Name == "" {
		return ErrNameRequired
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

	return nil
}

package section

import (
	"errors"

	"quotierlabs/backend/domain"
)

var (
	ErrNameRequired    = errors.New("section name is required")
	ErrInvalidSchema   = errors.New("invalid section schema")
)

func ValidateSectionDefinition(s *domain.SectionDefinition) error {
	if s.Name == "" {
		return ErrNameRequired
	}

	if s.Schema != "" {
		schema, err := ParseSchema(s.Schema)
		if err != nil {
			return ErrInvalidSchema
		}

		if err := ValidateSchema(schema); err != nil {
			return err
		}
	}

	return nil
}

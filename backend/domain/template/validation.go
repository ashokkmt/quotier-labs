package template

import (
	"errors"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentformat"
)

var (
	ErrNameRequired  = errors.New("template name is required")
	ErrInvalidLayout = errors.New("invalid template layout")
)

func ValidateTemplate(t *domain.Template) error {
	if t.Name == "" {
		return ErrNameRequired
	}

	if t.Layout == "" {
		return ErrInvalidLayout
	}
	version, err := documentformat.Validate([]byte(t.Layout))
	if err != nil || (t.SchemaVersion != 0 && version != t.SchemaVersion) {
		return ErrInvalidLayout
	}

	return nil
}

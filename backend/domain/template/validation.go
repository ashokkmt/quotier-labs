package template

import (
	"errors"

	"quotierlabs/backend/domain"
)

var (
	ErrNameRequired   = errors.New("template name is required")
	ErrInvalidLayout  = errors.New("invalid template layout")
)

func ValidateTemplate(t *domain.Template) error {
	if t.Name == "" {
		return ErrNameRequired
	}

	if t.Layout != "" {
		layout, err := ParseLayout(t.Layout)
		if err != nil {
			return ErrInvalidLayout
		}

		if err := ValidateLayout(layout); err != nil {
			return err
		}
	}

	return nil
}

package template

import (
	"errors"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
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
	if _, err := documentmodel.Parse([]byte(t.Layout)); err != nil {
		return ErrInvalidLayout
	}

	return nil
}

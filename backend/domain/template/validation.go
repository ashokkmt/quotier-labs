package template

import (
	"encoding/json"
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

	if t.Layout != "" {
		var envelope struct {
			SchemaVersion int `json:"schema_version"`
		}
		if err := json.Unmarshal([]byte(t.Layout), &envelope); err != nil {
			return ErrInvalidLayout
		}
		if envelope.SchemaVersion == documentmodel.SchemaVersion {
			if _, err := documentmodel.Parse([]byte(t.Layout)); err != nil {
				return ErrInvalidLayout
			}
			return nil
		}
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

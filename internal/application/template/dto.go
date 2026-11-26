package template

import "time"

type TemplateDTO struct {
	ID             string    `json:"id"`
	CompanyID      *string   `json:"company_id,omitempty"`
	Name           string    `json:"name"`
	Description    *string   `json:"description,omitempty"`
	Layout         string    `json:"layout"`
	SchemaVersion  int       `json:"schema_version"`
	IsBuiltin      bool      `json:"is_builtin"`
	CurrentVersion int       `json:"current_version"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type TemplateCreateDTO struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Layout      string  `json:"layout"`
}

type TemplateUpdateDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Layout      string  `json:"layout"`
}

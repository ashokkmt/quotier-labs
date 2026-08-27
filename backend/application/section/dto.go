package section

import "time"

type SectionDefinitionDTO struct {
	ID            string    `json:"id"`
	CompanyID     *string   `json:"company_id,omitempty"`
	Name          string    `json:"name"`
	Description   *string   `json:"description,omitempty"`
	Schema        string    `json:"schema"`
	SchemaVersion int       `json:"schema_version"`
	IsBuiltin     bool      `json:"is_builtin"`
	Category      *string   `json:"category,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type SectionCreateDTO struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Category    *string `json:"category,omitempty"`
	Schema      string  `json:"schema"`
}

type SectionUpdateDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Category    *string `json:"category,omitempty"`
	Schema      string  `json:"schema"`
}

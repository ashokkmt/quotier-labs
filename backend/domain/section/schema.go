package section

import (
	"encoding/json"
	"errors"
)

type FieldType string

const (
	TypeText     FieldType = "Text"
	TypeTextarea FieldType = "Textarea"
	TypeNumber   FieldType = "Number"
	TypeCurrency FieldType = "Currency"
	TypeDate     FieldType = "Date"
	TypeSelect   FieldType = "Select"
	TypeBoolean  FieldType = "Boolean"
	TypeImage    FieldType = "Image"
	TypeComputed FieldType = "Computed"
)

type ElementType string

const (
	ElementField ElementType = "Field"
	ElementTable ElementType = "Table"
)

type Element struct {
	Type ElementType `json:"element_type"` // Field or Table

	// If Field
	Field *FieldDefinition `json:"field,omitempty"`
	// If Table
	Table *TableDefinition `json:"table,omitempty"`
}

type FieldDefinition struct {
	ID           string                 `json:"id"`
	Label        string                 `json:"label"`
	Type         FieldType              `json:"type"`
	Required     bool                   `json:"required"`
	DefaultValue interface{}            `json:"default_value,omitempty"`
	Config       map[string]interface{} `json:"config,omitempty"`
}

type TableColumn struct {
	ID      string    `json:"id"`
	Label   string    `json:"label"`
	Type    FieldType `json:"type"`
	Formula string    `json:"formula,omitempty"`
	Width   string    `json:"width,omitempty"`
}

type TableDefinition struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Columns      []TableColumn          `json:"columns"`
	HasTotals    bool                   `json:"has_totals"`
	TotalsConfig map[string]interface{} `json:"totals_config,omitempty"`
}

type Schema struct {
	Elements []Element `json:"elements"`
}

func ParseSchema(schemaStr string) (*Schema, error) {
	if schemaStr == "" {
		return &Schema{Elements: []Element{}}, nil
	}

	var schema Schema
	if err := json.Unmarshal([]byte(schemaStr), &schema); err != nil {
		return nil, err
	}
	return &schema, nil
}

func (s *Schema) ToJSON() (string, error) {
	bytes, err := json.Marshal(s)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func ValidateSchema(s *Schema) error {
	if s == nil {
		return errors.New("schema is nil")
	}

	for _, el := range s.Elements {
		if el.Type != ElementField && el.Type != ElementTable {
			return errors.New("invalid element type")
		}

		if el.Type == ElementField {
			if el.Field == nil {
				return errors.New("missing field definition")
			}
			if el.Field.ID == "" {
				return errors.New("field ID is required")
			}
			if el.Field.Label == "" {
				return errors.New("field label is required")
			}
			if !isValidFieldType(el.Field.Type) {
				return errors.New("invalid field type: " + string(el.Field.Type))
			}
		}

		if el.Type == ElementTable {
			if el.Table == nil {
				return errors.New("missing table definition")
			}
			if el.Table.ID == "" {
				return errors.New("table ID is required")
			}
			for _, col := range el.Table.Columns {
				if col.ID == "" {
					return errors.New("table column ID is required")
				}
				if col.Label == "" {
					return errors.New("table column label is required")
				}
				if !isValidFieldType(col.Type) {
					return errors.New("invalid column field type: " + string(col.Type))
				}
			}
		}
	}

	return nil
}

func isValidFieldType(t FieldType) bool {
	switch t {
	case TypeText, TypeTextarea, TypeNumber, TypeCurrency, TypeDate, TypeSelect, TypeBoolean, TypeImage, TypeComputed:
		return true
	}
	return false
}

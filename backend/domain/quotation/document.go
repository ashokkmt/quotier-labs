package quotation

import (
	"encoding/json"
	"errors"
)

type Document struct {
	Rows []Row `json:"rows"`
}

type Row struct {
	ID      string   `json:"id"`
	Order   int      `json:"order"`
	Columns []Column `json:"columns"`
}

type Column struct {
	ID       string    `json:"id"`
	Order    int       `json:"order"`
	Width    string    `json:"width"`
	Sections []Section `json:"sections"`
}

type Section struct {
	ID                  string            `json:"id"`
	SectionDefinitionID string            `json:"section_definition_id"`
	Title               string            `json:"title"`
	Visibility          bool              `json:"visibility"`
	Optional            bool              `json:"optional"`
	Fields              []FieldValue      `json:"fields"`
	Tables              []TableDefinition `json:"tables"`
}

type FieldValue struct {
	ID       string                 `json:"id"`
	Label    string                 `json:"label"`
	Type     string                 `json:"type"`
	Required bool                   `json:"required"`
	Value    interface{}            `json:"value"`
	Config   map[string]interface{} `json:"config,omitempty"`
}

type TableDefinition struct {
	ID           string                   `json:"id"`
	Name         string                   `json:"name"`
	Columns      []TableColumn            `json:"columns"`
	Rows         []map[string]interface{} `json:"rows"`
	HasTotals    bool                     `json:"has_totals"`
	TotalsConfig map[string]interface{}   `json:"totals_config,omitempty"`
}

type TableColumn struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Type    string `json:"type"`
	Formula string `json:"formula,omitempty"`
	Width   string `json:"width,omitempty"`
}

func ParseDocument(docStr string) (*Document, error) {
	if docStr == "" {
		return &Document{Rows: []Row{}}, nil
	}
	var doc Document
	if err := json.Unmarshal([]byte(docStr), &doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

func (d *Document) ToJSON() (string, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ValidateDocument(d *Document) error {
	if d == nil {
		return errors.New("document is nil")
	}
	// Basic structural validation
	for _, row := range d.Rows {
		if row.ID == "" {
			return errors.New("row missing ID")
		}
		for _, col := range row.Columns {
			if col.ID == "" {
				return errors.New("column missing ID")
			}
			for _, sec := range col.Sections {
				if sec.ID == "" {
					return errors.New("section missing ID")
				}
				for _, f := range sec.Fields {
					if f.ID == "" {
						return errors.New("field missing ID")
					}
					if f.Required && f.Value == nil {
						// strict validation might occur later, for draft saving nil might be ok.
					}
				}
			}
		}
	}
	return nil
}

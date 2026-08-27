package template

import (
	"encoding/json"
	"errors"
)

type Layout struct {
	Rows []Row `json:"rows"`
}

type Row struct {
	ID      string   `json:"id"`
	Order   int      `json:"order"`
	Columns []Column `json:"columns"`
}

type ColumnWidth string

const (
	WidthFull       ColumnWidth = "100%"
	WidthHalf       ColumnWidth = "50%"
	WidthThird      ColumnWidth = "33%"
	WidthTwoThirds  ColumnWidth = "66%"
)

type Column struct {
	ID       string            `json:"id"`
	Order    int               `json:"order"`
	Width    ColumnWidth       `json:"width"`
	Sections []SectionInstance `json:"sections"`
}

type SectionInstance struct {
	ID                  string                 `json:"id"`
	SectionDefinitionID string                 `json:"section_definition_id"`
	TitleOverride       *string                `json:"title_override,omitempty"`
	Visibility          bool                   `json:"visibility"`
	Optional            bool                   `json:"optional"`
	FieldOverrides      map[string]interface{} `json:"field_overrides,omitempty"`
	LayoutOverrides     map[string]interface{} `json:"layout_overrides,omitempty"`
}

func ParseLayout(layoutStr string) (*Layout, error) {
	if layoutStr == "" {
		return &Layout{Rows: []Row{}}, nil
	}

	var l Layout
	if err := json.Unmarshal([]byte(layoutStr), &l); err != nil {
		return nil, err
	}
	return &l, nil
}

func (l *Layout) ToJSON() (string, error) {
	b, err := json.Marshal(l)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ValidateLayout(l *Layout) error {
	if l == nil {
		return errors.New("layout is nil")
	}

	// For MVP, we can keep it simple. Ensure section instances have definition ID.
	for _, row := range l.Rows {
		if row.ID == "" {
			return errors.New("row missing ID")
		}
		for _, col := range row.Columns {
			if col.ID == "" {
				return errors.New("column missing ID")
			}
			switch col.Width {
			case WidthFull, WidthHalf, WidthThird, WidthTwoThirds:
				// valid
			default:
				return errors.New("invalid column width")
			}
			for _, sec := range col.Sections {
				if sec.ID == "" {
					return errors.New("section instance missing ID")
				}
				if sec.SectionDefinitionID == "" {
					return errors.New("section definition ID missing")
				}
			}
		}
	}

	return nil
}

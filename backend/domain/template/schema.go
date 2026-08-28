package template

import (
	"encoding/json"
	"errors"
	"fmt"
	"quotierlabs/backend/domain"
)

const MaxDepth = 8

type BlockKind string

const (
	BlockSection BlockKind = "section"
	BlockRow     BlockKind = "row"
	BlockColumn  BlockKind = "column"
)

// Block is the single recursive structural node used by templates and documents.
// Content is deliberately structured; it is never HTML or executable code.
type Block struct {
	ID                  string                 `json:"id"`
	Kind                BlockKind              `json:"kind"`
	Children            []Block                `json:"children,omitempty"`
	Title               string                 `json:"title,omitempty"`
	Fields              []Field                `json:"fields,omitempty"`
	Tables              []Table                `json:"tables,omitempty"`
	SectionDefinitionID string                 `json:"section_definition_id,omitempty"`
	Overrides           map[string]interface{} `json:"overrides,omitempty"`
	Width               ColumnWidth            `json:"width,omitempty"`
	Visible             bool                   `json:"visible"`
	Optional            bool                   `json:"optional"`
}

type Field struct {
	ID       string                 `json:"id"`
	Label    string                 `json:"label"`
	Type     string                 `json:"type"`
	Required bool                   `json:"required"`
	Default  interface{}            `json:"default,omitempty"`
	Config   map[string]interface{} `json:"config,omitempty"`
	Value    interface{}            `json:"value,omitempty"`
}

type TableColumn struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Type    string `json:"type"`
	Formula string `json:"formula,omitempty"`
	Width   string `json:"width,omitempty"`
}

type Table struct {
	ID           string                   `json:"id"`
	Name         string                   `json:"name"`
	Columns      []TableColumn            `json:"columns"`
	Rows         []map[string]interface{} `json:"rows"`
	HasTotals    bool                     `json:"has_totals"`
	TotalsConfig map[string]interface{}   `json:"totals_config,omitempty"`
}

func CanContain(parent, child BlockKind) bool {
	switch parent {
	case "root":
		return child == BlockSection || child == BlockRow
	case BlockSection:
		return child == BlockSection || child == BlockRow
	case BlockRow:
		return child == BlockColumn
	case BlockColumn:
		return child == BlockSection || child == BlockRow
	}
	return false
}

func ValidateTree(root Block) error {
	return validateBlock(root, 1, map[string]bool{})
}
func validateBlock(b Block, depth int, ancestors map[string]bool) error {
	if b.ID == "" {
		return fmt.Errorf("block missing ID")
	}
	if depth > MaxDepth {
		return domain.ErrMaxDepthExceeded
	}
	if ancestors[b.ID] {
		return domain.ErrCycle
	}
	if b.Kind != BlockSection && b.Kind != BlockRow && b.Kind != BlockColumn {
		return fmt.Errorf("invalid block kind %q", b.Kind)
	}
	if b.Kind != BlockSection && (len(b.Fields) > 0 || len(b.Tables) > 0) {
		return domain.ErrFieldsOutsideSection
	}
	next := make(map[string]bool, len(ancestors)+1)
	for k, v := range ancestors {
		next[k] = v
	}
	next[b.ID] = true
	for _, child := range b.Children {
		if !CanContain(b.Kind, child.Kind) {
			return domain.ErrInvalidParent
		}
		if err := validateBlock(child, depth+1, next); err != nil {
			return err
		}
	}
	return nil
}

func ValidateRoot(children []Block) error {
	seen := map[string]bool{}
	for _, b := range children {
		if !CanContain("root", b.Kind) {
			return domain.ErrInvalidParent
		}
		if seen[b.ID] {
			return domain.ErrCycle
		}
		if err := validateBlock(b, 1, seen); err != nil {
			return err
		}
		seen[b.ID] = true
	}
	return nil
}

type Layout struct {
	SchemaVersion int     `json:"schema_version"`
	Children      []Block `json:"children,omitempty"`
	Rows          []Row   `json:"rows"`
}

type Row struct {
	ID      string   `json:"id"`
	Order   int      `json:"order"`
	Columns []Column `json:"columns"`
}

type ColumnWidth string

const (
	WidthFull      ColumnWidth = "100%"
	WidthHalf      ColumnWidth = "50%"
	WidthThird     ColumnWidth = "33%"
	WidthTwoThirds ColumnWidth = "66%"
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
		return &Layout{SchemaVersion: 1, Children: []Block{}}, nil
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

	if len(l.Children) > 0 {
		return ValidateRoot(l.Children)
	}
	// Legacy layouts remain readable and are normalized by callers on write.
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

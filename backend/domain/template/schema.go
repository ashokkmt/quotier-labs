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
	BlockSection   BlockKind = "section"
	BlockRow       BlockKind = "row"
	BlockColumn    BlockKind = "column"
	BlockContainer BlockKind = "container"
	BlockWidget    BlockKind = "widget"
)

// Block is the single recursive structural node used by templates and documents.
// Content is deliberately structured; it is never HTML or executable code.
type Block struct {
	ID                  string                 `json:"id"`
	Kind                BlockKind              `json:"kind"`
	WidgetType          string                 `json:"widget_type,omitempty"`
	Children            []Block                `json:"children,omitempty"`
	Title               string                 `json:"title,omitempty"`
	Fields              []Field                `json:"fields,omitempty"`
	Tables              []Table                `json:"tables,omitempty"`
	SectionDefinitionID string                 `json:"section_definition_id,omitempty"`
	Overrides           map[string]interface{} `json:"overrides,omitempty"`
	Width               ColumnWidth            `json:"width,omitempty"`
	Visible             bool                   `json:"visible"`
	Optional            bool                   `json:"optional"`
	Settings            map[string]interface{} `json:"settings,omitempty"`
	Layout              map[string]interface{} `json:"layout,omitempty"`
	Metadata            map[string]interface{} `json:"metadata,omitempty"`
	Role                string                 `json:"role,omitempty"`
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
		return child == BlockSection || child == BlockRow || child == BlockContainer || child == BlockWidget
	case BlockContainer:
		return child == BlockContainer || child == BlockWidget
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
	if b.Kind != BlockSection && b.Kind != BlockRow && b.Kind != BlockColumn && b.Kind != BlockContainer && b.Kind != BlockWidget {
		return fmt.Errorf("invalid block kind %q", b.Kind)
	}
	if b.Kind != BlockSection && b.Kind != BlockWidget && (len(b.Fields) > 0 || len(b.Tables) > 0) {
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
	if b.Kind == BlockWidget && len(b.Children) > 0 {
		return domain.ErrInvalidParent
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
	SchemaVersion int         `json:"schema_version"`
	Children      []Block     `json:"children,omitempty"`
	Rows          []Row       `json:"rows"`
	Root          *layoutNode `json:"root,omitempty"`
}

type layoutNode struct {
	ID         string                 `json:"id"`
	Kind       BlockKind              `json:"kind"`
	Role       string                 `json:"role,omitempty"`
	Type       string                 `json:"type,omitempty"`
	Widget     string                 `json:"widget,omitempty"`
	WidgetType string                 `json:"widget_type,omitempty"`
	Children   []layoutNode           `json:"children,omitempty"`
	Props      map[string]interface{} `json:"props,omitempty"`
	Settings   map[string]interface{} `json:"settings,omitempty"`
	Visible    *bool                  `json:"visible,omitempty"`
	Optional   *bool                  `json:"optional,omitempty"`
	Layout     map[string]interface{} `json:"layout,omitempty"`
	Meta       map[string]interface{} `json:"meta,omitempty"`
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
	if l.Root != nil {
		l.Children = make([]Block, 0, len(l.Root.Children))
		for _, child := range l.Root.Children {
			l.Children = append(l.Children, layoutBlock(child))
		}
	}
	return &l, nil
}

func layoutBlock(node layoutNode) Block {
	visible, optional := true, false
	if node.Visible != nil {
		visible = *node.Visible
	}
	if node.Optional != nil {
		optional = *node.Optional
	}
	settings := node.Settings
	if settings == nil {
		settings = node.Props
	}
	children := make([]Block, 0, len(node.Children))
	for _, child := range node.Children {
		children = append(children, layoutBlock(child))
	}
	kind := node.Kind
	if node.Role == "container" {
		kind = BlockContainer
	}
	if node.Role == "widget" {
		kind = BlockWidget
	}
	if node.Meta != nil {
		if raw, ok := node.Meta["visible"].(bool); ok {
			visible = raw
		}
		if raw, ok := node.Meta["optional"].(bool); ok {
			optional = raw
		}
	}
	block := Block{ID: node.ID, Kind: kind, Role: node.Role, WidgetType: firstLayoutValue(node.Type, node.WidgetType, node.Widget), Children: children, Settings: settings, Layout: node.Layout, Metadata: node.Meta, Visible: visible, Optional: optional}
	if raw, ok := settings["fields"]; ok {
		if encoded, err := json.Marshal(raw); err == nil {
			_ = json.Unmarshal(encoded, &block.Fields)
		}
	}
	if raw, ok := settings["tables"]; ok {
		if encoded, err := json.Marshal(raw); err == nil {
			_ = json.Unmarshal(encoded, &block.Tables)
		}
	}
	return block
}
func firstLayoutValue(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
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

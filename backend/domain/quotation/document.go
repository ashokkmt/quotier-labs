package quotation

import (
	"encoding/json"
	"errors"
	domain_template "quotierlabs/backend/domain/template"
)

// Block is shared with templates so the persisted document and template trees
// cannot drift apart. Values are carried by the field nodes in the same tree.
type Block = domain_template.Block

type Document struct {
	SchemaVersion int     `json:"schema_version,omitempty"`
	Children      []Block `json:"children,omitempty"`
	// Rows is retained only to read documents written before the recursive model.
	Rows []Row          `json:"rows"`
	Root *PersistedNode `json:"root,omitempty"`
}

type PersistedNode struct {
	ID         string                 `json:"id"`
	Kind       string                 `json:"kind"`
	Role       string                 `json:"role,omitempty"`
	Type       string                 `json:"type,omitempty"`
	Widget     string                 `json:"widget,omitempty"`
	WidgetType string                 `json:"widget_type,omitempty"`
	Children   []PersistedNode        `json:"children,omitempty"`
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
		return &Document{SchemaVersion: 1, Children: []Block{}, Rows: []Row{}}, nil
	}
	var doc Document
	if err := json.Unmarshal([]byte(docStr), &doc); err != nil {
		return nil, err
	}
	if doc.Root != nil {
		doc.Children = make([]Block, 0, len(doc.Root.Children))
		for _, child := range doc.Root.Children {
			doc.Children = append(doc.Children, persistedBlock(child))
		}
	}
	return &doc, nil
}

func persistedBlock(node PersistedNode) Block {
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
		children = append(children, persistedBlock(child))
	}
	kind := domain_template.BlockKind(node.Kind)
	if node.Role == "container" {
		kind = domain_template.BlockContainer
	}
	if node.Role == "widget" {
		kind = domain_template.BlockWidget
	}
	if node.Meta != nil {
		if raw, ok := node.Meta["visible"].(bool); ok {
			visible = raw
		}
		if raw, ok := node.Meta["optional"].(bool); ok {
			optional = raw
		}
	}
	layout := node.Layout
	if layout == nil {
		layout = map[string]interface{}{}
	}
	block := Block{ID: node.ID, Kind: kind, Role: node.Role, WidgetType: firstNonEmpty(node.Type, node.WidgetType, node.Widget), Children: children, Settings: settings, Layout: layout, Metadata: node.Meta, Visible: visible, Optional: optional}
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
func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
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
	if len(d.Children) > 0 {
		if err := domain_template.ValidateRoot(d.Children); err != nil {
			return err
		}
		return nil
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
					// strict validation might occur later, for draft saving nil might be ok.
				}
			}
		}
	}
	return nil
}

// Package documentmigration owns explicit compatibility adapters. Legacy JSON is decoded here,
// never by the strict V5 parser.
package documentmigration

import (
	"encoding/json"
	"fmt"

	"quotierlabs/backend/domain/documentmodel"
	domain_quotation "quotierlabs/backend/domain/quotation"
	domain_template "quotierlabs/backend/domain/template"
)

type IDFactory func(prefix string) string

// MarshalV5 validates before writing, preventing an invalid editor projection from reaching
// quotation/template persistence.
func MarshalV5(d *documentmodel.Document) ([]byte, error) {
	if err := documentmodel.Validate(d); err != nil {
		return nil, err
	}
	return json.Marshal(d)
}

func MigrateAndMarshal(raw []byte, nextID IDFactory) ([]byte, error) {
	d, err := Migrate(raw, nextID)
	if err != nil {
		return nil, err
	}
	return MarshalV5(d)
}

// Migrate converts legacy V1–V4 documents to a single bounded V5 page. Existing IDs are retained
// when unique; missing or duplicate IDs are replaced through the injected deterministic factory.
func Migrate(raw []byte, nextID IDFactory) (*documentmodel.Document, error) {
	version, err := domain_quotation.DocumentSchemaVersion(string(raw))
	if err != nil {
		return nil, fmt.Errorf("inspect document version: %w", err)
	}
	if version == documentmodel.SchemaVersion {
		return documentmodel.Parse(raw)
	}
	if version < 1 || version > 4 {
		return nil, fmt.Errorf("unsupported legacy document schema version %d", version)
	}
	return migrateLegacy(raw, nextID)
}

func migrateLegacy(raw []byte, nextID IDFactory) (*documentmodel.Document, error) {
	legacy, err := domain_quotation.ParseDocument(string(raw))
	if err != nil {
		return nil, fmt.Errorf("parse legacy document: %w", err)
	}
	if nextID == nil {
		return nil, fmt.Errorf("migration ID factory is required")
	}
	used := map[string]bool{}
	newID := func(want, prefix string) string {
		if want != "" && !used[want] {
			used[want] = true
			return want
		}
		for {
			id := nextID(prefix)
			if id != "" && !used[id] {
				used[id] = true
				return id
			}
		}
	}
	pageID := newID("", "page")
	children := make([]documentmodel.Node, 0)
	for _, b := range legacy.Children {
		children = append(children, convertBlock(b, newID))
	}
	if len(children) == 0 {
		for _, row := range legacy.Rows {
			children = append(children, convertRow(row, newID))
		}
	}
	childIDs := make([]string, len(children))
	for i := range children {
		childIDs[i] = children[i].ID
	}
	d := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: pageID, Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: childIDs, Children: children}}}}
	if err := documentmodel.Validate(d); err != nil {
		return nil, err
	}
	return d, nil
}

// The versioned entry points keep migration policy explicit and make it possible to tighten an
// individual legacy adapter without changing callers.
func MigrateV1ToV5(raw []byte, nextID IDFactory) (*documentmodel.Document, error) {
	return migrateParsed(raw, nextID, 1)
}
func MigrateV2ToV5(raw []byte, nextID IDFactory) (*documentmodel.Document, error) {
	return migrateParsed(raw, nextID, 2)
}
func MigrateV3ToV5(raw []byte, nextID IDFactory) (*documentmodel.Document, error) {
	return migrateParsed(raw, nextID, 3)
}
func MigrateV4ToV5(raw []byte, nextID IDFactory) (*documentmodel.Document, error) {
	return migrateParsed(raw, nextID, 4)
}

func migrateParsed(raw []byte, nextID IDFactory, expected int) (*documentmodel.Document, error) {
	version, err := domain_quotation.DocumentSchemaVersion(string(raw))
	if err != nil {
		return nil, err
	}
	if version != expected {
		return nil, fmt.Errorf("expected legacy schema version %d, got %d", expected, version)
	}
	return migrateLegacy(raw, nextID)
}

func convertBlock(b domain_template.Block, newID func(string, string) string) documentmodel.Node {
	role, kind := "element", "element"
	if b.Kind != domain_template.BlockWidget {
		role, kind = "group", "group"
	}
	if b.Kind == domain_template.BlockWidget && b.WidgetType != "" {
		kind = migratedWidgetKind(b.WidgetType)
	}
	children := make([]documentmodel.Node, len(b.Children))
	ids := make([]string, len(b.Children))
	for i, c := range b.Children {
		children[i] = convertBlock(c, newID)
		ids[i] = children[i].ID
	}
	props, _ := json.Marshal(map[string]interface{}{"title": b.Title, "settings": b.Settings, "fields": b.Fields, "tables": b.Tables, "section_definition_id": b.SectionDefinitionID})
	vis := "hidden"
	if b.Visible {
		vis = "shown"
	}
	return documentmodel.Node{ID: newID(b.ID, "node"), Kind: kind, Role: role, Geometry: documentmodel.Geometry{Width: documentmodel.A4WidthDU, Height: 1000}, LayoutMode: "fixed", Visibility: vis, Optional: b.Optional, ChildIDs: ids, Children: children, Props: props}
}

func migratedWidgetKind(legacy string) string {
	switch legacy {
	case "image", "table":
		return legacy
	default:
		// V5 keeps one controlled text renderer for legacy field/content widgets. The original
		// widget/settings payload remains in props for later specialized editing.
		return "text"
	}
}

func convertRow(row domain_quotation.Row, newID func(string, string) string) documentmodel.Node {
	children := make([]documentmodel.Node, len(row.Columns))
	ids := make([]string, len(row.Columns))
	for i, c := range row.Columns {
		children[i] = convertColumn(c, newID)
		ids[i] = children[i].ID
	}
	return documentmodel.Node{ID: newID(row.ID, "row"), Kind: "group", Role: "group", Geometry: documentmodel.Geometry{Width: documentmodel.A4WidthDU, Height: 1000}, LayoutMode: "fixed", Visibility: "shown", ChildIDs: ids, Children: children}
}
func convertColumn(c domain_quotation.Column, newID func(string, string) string) documentmodel.Node {
	children := make([]documentmodel.Node, len(c.Sections))
	ids := make([]string, len(c.Sections))
	for i, s := range c.Sections {
		children[i] = documentmodel.Node{ID: newID(s.ID, "section"), Kind: "group", Role: "group", Geometry: documentmodel.Geometry{Width: documentmodel.A4WidthDU, Height: 1000}, LayoutMode: "fixed", Visibility: "shown"}
		ids[i] = children[i].ID
	}
	return documentmodel.Node{ID: newID(c.ID, "column"), Kind: "group", Role: "group", Geometry: documentmodel.Geometry{Width: documentmodel.A4WidthDU, Height: 1000}, LayoutMode: "fixed", Visibility: "shown", ChildIDs: ids, Children: children}
}

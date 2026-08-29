package documentmodel

import (
	"errors"
	"testing"
)

func validDocument() *Document {
	return &Document{SchemaVersion: SchemaVersion, Settings: Settings{PageSize: "A4", Orientation: "portrait"}, Root: Root{Pages: []Page{{ID: "page-1", Width: A4WidthDU, Height: A4HeightDU, Children: []Node{{ID: "title", Kind: "text", Role: "element", Geometry: Geometry{Width: 1000, Height: 500}, LayoutMode: "fixed", Visibility: "shown"}}, ChildIDs: []string{"title"}}}}}
}

func TestValidateV5Document(t *testing.T) {
	if err := Validate(validDocument()); err != nil {
		t.Fatalf("valid document rejected: %v", err)
	}
}

func TestParseRejectsUnknownFieldsAndWrongVersion(t *testing.T) {
	_, err := Parse([]byte(`{"schema_version":5,"root":{"pages":[],"unexpected":true},"settings":{"page_size":"A4","orientation":"portrait"}}`))
	if err == nil {
		t.Fatal("expected unknown field error")
	}
	_, err = Parse([]byte(`{"schema_version":4}`))
	if !errors.Is(err, ErrSchemaVersion) {
		t.Fatalf("expected schema error, got %v", err)
	}
}

func TestValidateFlowFrameRequiresStoryAndOrderedChildren(t *testing.T) {
	d := validDocument()
	d.Root.Pages[0].Children[0].Role = "flow-frame"
	d.Root.Pages[0].Children[0].Kind = "flow-frame"
	d.Root.Pages[0].Children[0].LayoutMode = "flow-frame"
	if err := Validate(d); err == nil {
		t.Fatal("expected missing story error")
	}
	d.Stories = []Story{{ID: "story-1", Kind: "rich-text"}}
	d.Root.Pages[0].Children[0].StoryID = "story-1"
	d.Root.Pages[0].ChildIDs = []string{"other"}
	if err := Validate(d); err == nil {
		t.Fatal("expected child order error")
	}
}

func TestValidateRejectsUnknownMasterReference(t *testing.T) {
	d := validDocument()
	d.Root.Pages[0].MasterID = "missing"
	if err := Validate(d); err == nil {
		t.Fatal("expected missing master error")
	}
}

func TestValidateRejectsUnknownWidgetKind(t *testing.T) {
	doc := &Document{SchemaVersion: SchemaVersion, Settings: Settings{PageSize: "A4", Orientation: "portrait"}, Root: Root{Pages: []Page{{ID: "p", Width: A4WidthDU, Height: A4HeightDU, ChildIDs: []string{"n"}, Children: []Node{
		{ID: "n", Kind: "iframe", Role: "element", Geometry: Geometry{Width: 1000, Height: 1000}, Visibility: "shown", LayoutMode: "fixed"},
	}}}}}
	if err := Validate(doc); err == nil {
		t.Fatal("expected unknown widget kind to be rejected")
	}
}

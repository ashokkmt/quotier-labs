package layoutir

import (
	"context"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
	"testing"
)

func TestResolveSkipsHiddenAndPreservesOrder(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, Children: []documentmodel.Node{{ID: "a", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{Width: 100, Height: 100}, LayoutMode: "fixed", Visibility: "shown"}, {ID: "b", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{Width: 100, Height: 100}, LayoutMode: "fixed", Visibility: "hidden"}}, ChildIDs: []string{"a", "b"}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages) != 1 || len(layout.Pages[0].Boxes) != 1 || layout.Pages[0].Boxes[0].ID != "a" {
		t.Fatalf("unexpected layout %#v", layout)
	}
}

func TestResolveAppliesMasterBeforePageChildren(t *testing.T) {
	doc := &documentmodel.Document{
		SchemaVersion: documentmodel.SchemaVersion,
		Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait", DefaultMasterID: "master"},
		Root: documentmodel.Root{
			Masters: []documentmodel.Master{{ID: "master", ChildIDs: []string{"header"}, Children: []documentmodel.Node{{ID: "header", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{Width: 100, Height: 100}, LayoutMode: "fixed", Visibility: "shown"}}}},
			Pages:   []documentmodel.Page{{ID: "page", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"body"}, Children: []documentmodel.Node{{ID: "body", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{Width: 100, Height: 100}, LayoutMode: "fixed", Visibility: "shown"}}}},
		},
	}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	if got := layout.Pages[0].Boxes; len(got) != 2 || got[0].ID != "header" || got[1].ID != "body" {
		t.Fatalf("master/page paint order = %#v", got)
	}
}

func TestResolveFragmentsStoriesAndReportsOverset(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Stories: []documentmodel.Story{{ID: "story", Kind: "rich-text", Content: []byte(`{"text":"one two three four five six seven eight nine ten"}`)}}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"frame"}, Children: []documentmodel.Node{{ID: "frame", Kind: "flow-frame", Role: "flow-frame", StoryID: "story", Geometry: documentmodel.Geometry{Width: 200, Height: 200}, LayoutMode: "flow-frame", Visibility: "shown"}}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	if layout.Pages[0].Boxes[0].Text == "" {
		t.Fatal("expected a story fragment")
	}
	if len(layout.Diagnostics) == 0 || layout.Diagnostics[0].Code != "overset_story" {
		t.Fatalf("expected overset story diagnostic, got %#v", layout.Diagnostics)
	}
}

func TestResolveResolvesOnlyAllowlistedBindingsAndHonorsCancellation(t *testing.T) {
	name := "Quotier"
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"company"}, Children: []documentmodel.Node{{ID: "company", Kind: "text", Role: "element", BindingKind: "company", Geometry: documentmodel.Geometry{Width: 10000, Height: 1000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"binding":{"field":"name"}}`)}}}}}}
	layout, err := ResolveWithInput(context.Background(), doc, ResolveInput{Company: &domain.Company{Name: name}})
	if err != nil || layout.Pages[0].Boxes[0].Text != name {
		t.Fatalf("binding result = %#v, %v", layout, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := ResolveWithInput(ctx, doc, ResolveInput{}); err == nil {
		t.Fatal("expected cancellation")
	}
}

func TestResolveDerivesContinuationPagesWithoutPersistingThem(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Stories: []documentmodel.Story{{ID: "story", Kind: "rich-text", Content: []byte(`{"text":"one two three four five six seven eight nine ten"}`)}}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"frame"}, Children: []documentmodel.Node{{ID: "frame", Kind: "flow-frame", Role: "flow-frame", StoryID: "story", Continuation: "auto-pages", Geometry: documentmodel.Geometry{Width: 200, Height: 200}, LayoutMode: "flow-frame", Visibility: "shown"}}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages) < 2 || doc.Root.Pages[0].Children[0].ID != "frame" {
		t.Fatalf("expected derived pages without document mutation: %#v", layout.Pages)
	}
}

func TestResolveTableStoryCreatesHeaderedFragment(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Stories: []documentmodel.Story{{ID: "table", Kind: "table", Content: []byte(`{"headers":["Item","Amount"],"rows":[["A","1"],["B","2"]]}`)}}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"frame"}, Children: []documentmodel.Node{{ID: "frame", Kind: "flow-frame", Role: "flow-frame", StoryID: "table", Geometry: documentmodel.Geometry{Width: 2000, Height: 2000}, LayoutMode: "flow-frame", Visibility: "shown"}}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	fragment := layout.Pages[0].Boxes[0].Table
	if fragment == nil || len(fragment.Headers) != 2 || len(fragment.Rows) != 1 {
		t.Fatalf("unexpected table fragment %#v", fragment)
	}
}

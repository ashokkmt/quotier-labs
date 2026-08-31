package layoutir

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"strconv"
	"testing"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
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

func TestResolveComposesRotatedGroupAroundBoxCenters(t *testing.T) {
	doc := &documentmodel.Document{
		SchemaVersion: documentmodel.SchemaVersion,
		Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait"},
		Root: documentmodel.Root{Pages: []documentmodel.Page{{
			ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU,
			ChildIDs: []string{"group"},
			Children: []documentmodel.Node{{
				ID: "group", Kind: "group", Role: "group",
				Geometry:   documentmodel.Geometry{X: 1000, Y: 1000, Width: 10000, Height: 10000, Rotation: 9000},
				LayoutMode: "fixed", Visibility: "shown", ChildIDs: []string{"child"},
				Children: []documentmodel.Node{{
					ID: "child", Kind: "text", Role: "element",
					Geometry:   documentmodel.Geometry{X: 100, Y: 200, Width: 1000, Height: 1000},
					LayoutMode: "fixed", Visibility: "shown",
				}},
			}},
		}}},
	}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	box := layout.Pages[0].Boxes[0]
	if math.Abs(box.X-9800/DUPerMM) > 0.0001 || math.Abs(box.Y-1100/DUPerMM) > 0.0001 || box.Rotation != 9000 {
		t.Fatalf("composed box = %#v", box)
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
	if layout.Diagnostics[0].NodeID != "frame" {
		t.Fatalf("expected diagnostic to select frame, got %#v", layout.Diagnostics[0])
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

func TestResolveBlankHeaderlessTableUsesConfiguredDimensions(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Stories: []documentmodel.Story{{ID: "table", Kind: "table", Content: []byte(`{"headers":["",""],"rows":[["hello","world"],["",""]],"column_count":2,"header_enabled":false,"repeat_header":false,"row_height_mm":8,"column_widths":[16000,16000]}`)}}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"frame"}, Children: []documentmodel.Node{{ID: "frame", Kind: "flow-frame", Role: "flow-frame", StoryID: "table", Geometry: documentmodel.Geometry{Width: 32000, Height: 4536}, LayoutMode: "flow-frame", Visibility: "shown"}}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	fragment := layout.Pages[0].Boxes[0].Table
	if fragment == nil || fragment.HeaderEnabled || fragment.ColumnCount != 2 || fragment.RowHeightMM != 8 || len(fragment.Rows) != 2 {
		t.Fatalf("unexpected generic table fragment %#v", fragment)
	}
	if len(fragment.ColumnWidthsMM) != 2 || math.Abs(fragment.ColumnWidthsMM[0]-fragment.ColumnWidthsMM[1]) > 0.001 {
		t.Fatalf("unexpected column widths %#v", fragment.ColumnWidthsMM)
	}
	if len(layout.Diagnostics) != 0 {
		t.Fatalf("an exactly-sized table must not report overset: %#v", layout.Diagnostics)
	}
}

func TestResolveIsDeterministic(t *testing.T) {
	doc := &documentmodel.Document{
		SchemaVersion: documentmodel.SchemaVersion,
		Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait"},
		Stories: []documentmodel.Story{
			{ID: "s1", Kind: "rich-text", Content: []byte(`{"text":"alpha beta gamma delta epsilon zeta eta theta"}`)},
			{ID: "s2", Kind: "rich-text", Content: []byte(`{"text":"lorem ipsum dolor sit amet consectetur adipiscing elit sed do"}`)},
			{ID: "t1", Kind: "table", Content: []byte(`{"headers":["A","B"],"rows":[["1","2"],["3","4"],["5","6"],["7","8"]]}`)},
		},
		Root: documentmodel.Root{
			Pages: []documentmodel.Page{
				{ID: "p1", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"f1", "f2"}, Children: []documentmodel.Node{
					{ID: "f1", Kind: "flow-frame", Role: "flow-frame", StoryID: "s1", Continuation: "auto-pages", Geometry: documentmodel.Geometry{Width: 5000, Height: 5000}, LayoutMode: "flow-frame", Visibility: "shown"},
					{ID: "f2", Kind: "flow-frame", Role: "flow-frame", StoryID: "s2", Continuation: "auto-pages", Geometry: documentmodel.Geometry{Width: 5000, Height: 5000}, LayoutMode: "flow-frame", Visibility: "shown"},
				}},
				{ID: "p2", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"f3"}, Children: []documentmodel.Node{
					{ID: "f3", Kind: "flow-frame", Role: "flow-frame", StoryID: "t1", Continuation: "auto-pages", Geometry: documentmodel.Geometry{Width: 50000, Height: 30000}, LayoutMode: "flow-frame", Visibility: "shown"},
				}},
			},
		},
	}
	first, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	for round := 0; round < 20; round++ {
		next, err := Resolve(doc)
		if err != nil {
			t.Fatal(err)
		}
		a, _ := json.Marshal(first)
		b, _ := json.Marshal(next)
		if !bytes.Equal(a, b) {
			t.Fatalf("layout is not deterministic at round %d", round)
		}
	}
}

func TestResolveDerivesTableContinuationPagesWithRepeatedHeaders(t *testing.T) {
	rows := make([][]string, 0, 40)
	for i := 0; i < 40; i++ {
		rows = append(rows, []string{strconv.Itoa(i), "x"})
	}
	content, err := json.Marshal(tableStory{Headers: []string{"Item", "Amount"}, Rows: rows})
	if err != nil {
		t.Fatal(err)
	}
	doc := &documentmodel.Document{
		SchemaVersion: documentmodel.SchemaVersion,
		Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait"},
		Stories:       []documentmodel.Story{{ID: "table", Kind: "table", Content: content}},
		Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"frame"}, Children: []documentmodel.Node{
			{ID: "frame", Kind: "flow-frame", Role: "flow-frame", StoryID: "table", Continuation: "auto-pages", Geometry: documentmodel.Geometry{Width: 50000, Height: 11000}, LayoutMode: "flow-frame", Visibility: "shown"},
		}}}},
	}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages) < 2 {
		t.Fatalf("expected derived continuation pages, got %d", len(layout.Pages))
	}
	var totalRows, headerFragments int
	for _, page := range layout.Pages {
		for _, box := range page.Boxes {
			if box.Table == nil {
				continue
			}
			totalRows += len(box.Table.Rows)
			if box.Table.RepeatedHeader {
				headerFragments++
				if len(box.Table.Headers) != 2 {
					t.Fatalf("repeated header fragment lost headers: %#v", box.Table)
				}
			}
		}
	}
	if totalRows != 40 {
		t.Fatalf("expected all 40 rows distributed, got %d", totalRows)
	}
	if headerFragments == 0 {
		t.Fatal("expected at least one repeated-header continuation fragment")
	}
	if len(layout.Diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", layout.Diagnostics)
	}
}

func TestResolveDerivesPagesWithMasterAndPageNumbers(t *testing.T) {
	doc := &documentmodel.Document{
		SchemaVersion: documentmodel.SchemaVersion,
		Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait", DefaultMasterID: "master"},
		Stories:       []documentmodel.Story{{ID: "story", Kind: "rich-text", Content: []byte(`{"text":"one two three four five six seven eight nine ten eleven twelve"}`)}},
		Root: documentmodel.Root{
			Masters: []documentmodel.Master{{ID: "master", ChildIDs: []string{"pageno", "rule"}, Children: []documentmodel.Node{
				{ID: "pageno", Kind: "text", Role: "element", BindingKind: "calculation", Geometry: documentmodel.Geometry{X: 20000, Y: 80000, Width: 5000, Height: 2000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"binding":{"field":"page_number"}}`)},
				{ID: "rule", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{X: 0, Y: 83000, Width: 50000, Height: 500}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"footer"}`)},
			}}},
			Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"frame"}, Children: []documentmodel.Node{
				{ID: "frame", Kind: "flow-frame", Role: "flow-frame", StoryID: "story", Continuation: "auto-pages", Geometry: documentmodel.Geometry{Width: 20000, Height: 20000}, LayoutMode: "flow-frame", Visibility: "shown"},
			}}},
		},
	}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages) < 2 {
		t.Fatalf("expected derived pages, got %d", len(layout.Pages))
	}
	derived := layout.Pages[1]
	if len(derived.Boxes) < 2 {
		t.Fatalf("derived page should repeat master content, got %#v", derived.Boxes)
	}
	foundPageNumber := false
	for _, box := range derived.Boxes {
		if box.ID == "pageno" && box.Text == "2" {
			foundPageNumber = true
		}
	}
	if !foundPageNumber {
		t.Fatalf("derived page should resolve page_number binding to 2: %#v", derived.Boxes)
	}
}

func TestResolveReportsIntrinsicOverflowAndKeepsGeometry(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"t"}, Children: []documentmodel.Node{
		{ID: "t", Kind: "text", Role: "element", LayoutMode: "intrinsic", Geometry: documentmodel.Geometry{X: 0, Y: 80000, Width: 20000, Height: 1000}, Visibility: "shown", Props: []byte(`{"text":"lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud"}`)},
	}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, d := range layout.Diagnostics {
		if d.Code == "intrinsic_overflow" && d.NodeID == "t" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected intrinsic_overflow diagnostic, got %#v", layout.Diagnostics)
	}
}

func TestResolveRejectsInvalidContinuationMasterAndPolicy(t *testing.T) {
	base := func(props string) *documentmodel.Document {
		return &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Stories: []documentmodel.Story{{ID: "s", Kind: "rich-text", Content: []byte(`{"text":"hi"}`)}}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"f"}, Children: []documentmodel.Node{
			{ID: "f", Kind: "flow-frame", Role: "flow-frame", StoryID: "s", Geometry: documentmodel.Geometry{Width: 20000, Height: 20000}, LayoutMode: "flow-frame", Visibility: "shown"},
		}}}}}
	}
	doc := base("")
	doc.Root.Pages[0].Children[0].ContinuationMasterID = "missing"
	if err := documentmodel.Validate(doc); err == nil {
		t.Fatal("expected missing continuation master to be rejected")
	}
	doc2 := base("")
	doc2.Root.Pages[0].Children[0].Continuation = "magic"
	if err := documentmodel.Validate(doc2); err == nil {
		t.Fatal("expected invalid continuation policy to be rejected")
	}
}

// A clean document must resolve with a non-nil, empty diagnostics slice so transport layers
// marshal [] rather than null (a null slice crashed the diagnostics banner).
func TestResolveCleanDocumentHasEmptyNonNilDiagnostics(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"t"}, Children: []documentmodel.Node{
		{ID: "t", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{Width: 10000, Height: 2000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"fits"}`)},
	}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	if layout.Diagnostics == nil {
		t.Fatal("diagnostics slice must be non-nil for a clean resolution")
	}
	if len(layout.Diagnostics) != 0 {
		t.Fatalf("expected no diagnostics, got %#v", layout.Diagnostics)
	}
	encoded, err := json.Marshal(layout)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(encoded, []byte(`"Diagnostics":[]`)) {
		t.Fatalf("expected diagnostics to marshal as [], got %s", encoded)
	}
}

func TestResolveShapeProps(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"r", "e", "l"}, Children: []documentmodel.Node{
		{ID: "r", Kind: "shape", Role: "element", Geometry: documentmodel.Geometry{X: 0, Y: 0, Width: 10000, Height: 5000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"variant":"rect","fill":"primary","stroke":"black","strokeStyle":"dashed","strokeWidth":2}`)},
		{ID: "e", Kind: "shape", Role: "element", Geometry: documentmodel.Geometry{X: 0, Y: 10000, Width: 5000, Height: 5000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"variant":"ellipse","fill":"none","stroke":"danger"}`)},
		{ID: "l", Kind: "shape", Role: "element", Geometry: documentmodel.Geometry{X: 0, Y: 20000, Width: 20000, Height: 200}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"variant":"line","fill":"none","stroke":"black"}`)},
	}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	rect := layout.Pages[0].Boxes[0].Shape
	if rect == nil || rect.Variant != "rect" || rect.Fill != "primary" || rect.Stroke == nil || rect.Stroke.Color != "black" || rect.Stroke.Style != "dashed" || rect.Stroke.WidthPt != 2 {
		t.Fatalf("rect shape = %#v", rect)
	}
	ellipse := layout.Pages[0].Boxes[1].Shape
	if ellipse == nil || ellipse.Variant != "ellipse" || ellipse.Fill != "none" || ellipse.Stroke == nil || ellipse.Stroke.Color != "danger" {
		t.Fatalf("ellipse shape = %#v", ellipse)
	}
	line := layout.Pages[0].Boxes[2].Shape
	if line == nil || line.Variant != "line" || line.Stroke == nil || line.Stroke.Color != "black" {
		t.Fatalf("line shape = %#v", line)
	}
}

func TestResolveRejectsInvalidShapeAndTextTokens(t *testing.T) {
	base := func(props string) *documentmodel.Document {
		return &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"n"}, Children: []documentmodel.Node{
			{ID: "n", Kind: "shape", Role: "element", Geometry: documentmodel.Geometry{Width: 10000, Height: 5000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(props)},
		}}}}}
	}
	if _, err := Resolve(base(`{"variant":"blob","fill":"none"}`)); err == nil {
		t.Fatal("expected invalid shape variant to be rejected")
	}
	if _, err := Resolve(base(`{"variant":"rect","fill":"rgb(255,0,255)"}`)); err == nil {
		t.Fatal("expected arbitrary CSS color to be rejected")
	}
	if _, err := Resolve(base(`{"variant":"rect","stroke":"black","strokeStyle":"zigzag"}`)); err == nil {
		t.Fatal("expected invalid stroke style to be rejected")
	}
	if _, err := Resolve(base(`{"variant":"rect","stroke":"black","strokeWidth":99}`)); err == nil {
		t.Fatal("expected out-of-bounds stroke width to be rejected")
	}
	textDoc := base(`{"variant":"rect"}`)
	textDoc.Root.Pages[0].Children[0].Kind = "text"
	textDoc.Root.Pages[0].Children[0].Props = []byte(`{"text":"hello","fontSize":500}`)
	if _, err := Resolve(textDoc); err == nil {
		t.Fatal("expected out-of-bounds font size to be rejected")
	}
}

func TestResolveStyledTextCarriesTokens(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"h"}, Children: []documentmodel.Node{
		{ID: "h", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{X: 0, Y: 0, Width: 20000, Height: 3000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"Invoice","fontSize":18,"bold":true,"align":"center","verticalAlign":"bottom","color":"primary"}`)},
	}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	box := layout.Pages[0].Boxes[0]
	if box.FontSizePt != 18 || !box.Bold || box.Align != "center" || box.VerticalAlign != "bottom" || box.TextColor != "primary" || box.Text != "Invoice" {
		t.Fatalf("styled text box = %#v", box)
	}
	if len(layout.Diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics %#v", layout.Diagnostics)
	}
}

func TestResolveCarriesValidatedTypographyAndHexColor(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"text"}, Children: []documentmodel.Node{{ID: "text", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{Width: 20000, Height: 3000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"Styled","fontFamily":"serif","fontWeight":600,"italic":true,"underline":true,"color":"#AABBCC"}`)}}}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	box := layout.Pages[0].Boxes[0]
	if box.FontFamily != "serif" || box.FontWeight != 600 || !box.Bold || !box.Italic || !box.Underline || box.TextColor != "#AABBCC" {
		t.Fatalf("typography = %#v", box)
	}
}

func TestResolveIgnoresOrphanStoriesForDiagnostics(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Stories: []documentmodel.Story{{ID: "orphan-text", Kind: "rich-text", Content: []byte(`{"text":"This story has no frame"}`)}, {ID: "orphan-table", Kind: "table", Content: []byte(`{"headers":["Item"],"rows":[["A"]]}`)}}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU}}}}
	layout, err := Resolve(doc)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Diagnostics) != 0 {
		t.Fatalf("orphan stories produced diagnostics: %#v", layout.Diagnostics)
	}
}

func TestResolveRejectsInvalidVerticalTextAlignment(t *testing.T) {
	doc := &documentmodel.Document{SchemaVersion: documentmodel.SchemaVersion, Settings: documentmodel.Settings{PageSize: "A4", Orientation: "portrait"}, Root: documentmodel.Root{Pages: []documentmodel.Page{{ID: "p", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: []string{"text"}, Children: []documentmodel.Node{{ID: "text", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{Width: 20000, Height: 3000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"Invoice","verticalAlign":"baseline"}`)}}}}}}
	if _, err := Resolve(doc); err == nil {
		t.Fatal("expected invalid vertical alignment to be rejected")
	}
}

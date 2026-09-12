package flowlayout

import (
	"context"
	"encoding/json"
	"testing"

	"quotierlabs/backend/domain/documentv6"
)

func attrs(value any) json.RawMessage { raw, _ := json.Marshal(value); return raw }

func TestResolvePageBreakAndRuns(t *testing.T) {
	doc := documentv6.NewBlank("p1")
	doc.Body.Content[0].Content = []documentv6.Node{{Type: "text", Text: "important", Marks: []documentv6.Mark{{Type: "bold"}}}}
	doc.Body.Content = append(doc.Body.Content, documentv6.Node{Type: "pageBreak", Attrs: attrs(documentv6.IDAttrs{ID: "break"})}, documentv6.Node{Type: "paragraph", Attrs: attrs(documentv6.ParagraphAttrs{ID: "p2"}), Content: []documentv6.Node{{Type: "text", Text: "page two"}}})
	layout, err := Resolve(context.Background(), doc, ResolveInput{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages) != 2 || layout.Pages[0].Blocks[0].Lines[0].Runs[0].Bold != true {
		t.Fatalf("unexpected layout: %+v", layout)
	}
	pageMap := layout.PageMap(doc)
	if pageMap.PageCount != 2 || len(pageMap.Ranges) != 3 {
		t.Fatalf("unexpected page map: %+v", pageMap)
	}
}

func TestExplicitBreaksAndParagraphGeometry(t *testing.T) {
	doc := documentv6.NewBlank("p1")
	doc.Body.Content[0].Attrs = attrs(documentv6.ParagraphAttrs{ID: "p1", SpacingBefore: 1200, FirstLineIndent: 1800})
	doc.Body.Content = append(doc.Body.Content,
		documentv6.Node{Type: "pageBreak", Attrs: attrs(documentv6.IDAttrs{ID: "break-1"})},
		documentv6.Node{Type: "pageBreak", Attrs: attrs(documentv6.IDAttrs{ID: "break-2"})},
	)
	layout, err := Resolve(context.Background(), doc, ResolveInput{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages) != 3 || layout.Pages[0].Blocks[0].TextTop <= 0 || layout.Pages[0].Blocks[0].FirstLine <= 0 {
		t.Fatalf("explicit breaks or paragraph geometry were lost: %+v", layout)
	}
}

func TestResolveTableAndLineItems(t *testing.T) {
	doc := documentv6.NewBlank("p")
	cell := func(id, text string) documentv6.Node {
		return documentv6.Node{Type: "tableCell", Attrs: attrs(documentv6.TableCellAttrs{Colspan: 1, Rowspan: 1, Background: "transparent", Alignment: "left"}), Content: []documentv6.Node{{Type: "paragraph", Attrs: attrs(documentv6.ParagraphAttrs{ID: id}), Content: []documentv6.Node{{Type: "text", Text: text}}}}}
	}
	doc.Body.Content = []documentv6.Node{{Type: "table", Attrs: attrs(documentv6.TableAttrs{ID: "t", ColumnWidths: []int64{10000, 10000}, Alignment: "left", BorderColor: "#111827"}), Content: []documentv6.Node{{Type: "tableRow", Content: []documentv6.Node{cell("c1", "A"), cell("c2", "B")}}}}, {Type: "lineItemTable", Attrs: attrs(documentv6.LineItemTableAttrs{ID: "li", Rows: []documentv6.LineItem{{ID: "r1", Description: "Service", Quantity: 2, Rate: 10000, TaxRate: 18}}})}}
	layout, err := Resolve(context.Background(), doc, ResolveInput{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages[0].Blocks) != 4 {
		t.Fatalf("blocks=%d", len(layout.Pages[0].Blocks))
	}
}

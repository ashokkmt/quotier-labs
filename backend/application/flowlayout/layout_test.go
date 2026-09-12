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

func TestTableRowsUseMinimumAndContentDrivenHeights(t *testing.T) {
	cell := func(id string, fontSize int64) documentv6.Node {
		marks := []documentv6.Mark{}
		if fontSize > 0 {
			marks = append(marks, documentv6.Mark{Type: "textStyle", Attrs: attrs(documentv6.TextStyleAttrs{FontSize: fontSize})})
		}
		return documentv6.Node{Type: "tableCell", Attrs: attrs(documentv6.TableCellAttrs{Colspan: 1, Rowspan: 1}), Content: []documentv6.Node{{Type: "paragraph", Attrs: attrs(documentv6.ParagraphAttrs{ID: id}), Content: []documentv6.Node{{Type: "text", Text: "Content", Marks: marks}}}}}
	}
	doc := documentv6.NewBlank("body")
	doc.Body.Content = []documentv6.Node{{Type: "table", Attrs: attrs(documentv6.TableAttrs{ID: "table", ColumnWidths: []int64{20000}}), Content: []documentv6.Node{
		{Type: "tableRow", Attrs: attrs(documentv6.TableRowAttrs{MinHeight: 12000}), Content: []documentv6.Node{cell("minimum", 0)}},
		{Type: "tableRow", Attrs: attrs(documentv6.TableRowAttrs{MinHeight: 2400}), Content: []documentv6.Node{cell("large", 2000)}},
	}}}
	layout, err := Resolve(context.Background(), doc, ResolveInput{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if layout.Pages[0].Blocks[0].Height < float64(12000)/duPerMM {
		t.Fatalf("saved minimum height was lost: %f", layout.Pages[0].Blocks[0].Height)
	}
	if layout.Pages[0].Blocks[1].Height <= 8 {
		t.Fatalf("large content did not expand its row: %f", layout.Pages[0].Blocks[1].Height)
	}
}

func TestPhase2ListsStylesAndPageStories(t *testing.T) {
	doc := documentv6.NewBlank("title")
	doc.Body.Content[0].Attrs = attrs(documentv6.ParagraphAttrs{ID: "title", Style: "Title"})
	doc.Body.Content[0].Content = []documentv6.Node{{Type: "text", Text: "Quotation", Marks: []documentv6.Mark{{Type: "strike"}}}}
	listParagraph := documentv6.Node{Type: "paragraph", Attrs: attrs(documentv6.ParagraphAttrs{ID: "list-p"}), Content: []documentv6.Node{{Type: "text", Text: "One"}, {Type: "hardBreak"}, {Type: "text", Text: "continued"}}}
	nestedParagraph := documentv6.Node{Type: "paragraph", Attrs: attrs(documentv6.ParagraphAttrs{ID: "nested-p"}), Content: []documentv6.Node{{Type: "text", Text: "Nested"}}}
	nested := documentv6.Node{Type: "bulletList", Attrs: attrs(documentv6.ListAttrs{ID: "nested-list"}), Content: []documentv6.Node{{Type: "listItem", Attrs: attrs(documentv6.IDAttrs{ID: "nested-item"}), Content: []documentv6.Node{nestedParagraph}}}}
	doc.Body.Content = append(doc.Body.Content,
		documentv6.Node{Type: "orderedList", Attrs: attrs(documentv6.ListAttrs{ID: "list", Start: 3}), Content: []documentv6.Node{{Type: "listItem", Attrs: attrs(documentv6.IDAttrs{ID: "item"}), Content: []documentv6.Node{listParagraph, nested}}}},
		documentv6.Node{Type: "pageBreak", Attrs: attrs(documentv6.IDAttrs{ID: "break"})},
		documentv6.Node{Type: "horizontalRule", Attrs: attrs(documentv6.IDAttrs{ID: "rule"})},
	)
	doc.Settings.DifferentFirstPage = true
	doc.HeaderStory = &documentv6.Node{Type: "doc", Content: []documentv6.Node{{Type: "paragraph", Attrs: attrs(documentv6.ParagraphAttrs{ID: "default-header"}), Content: []documentv6.Node{{Type: "text", Text: "Page "}, {Type: "pageNumber"}, {Type: "text", Text: "/"}, {Type: "pageCount"}}}}}
	doc.FirstPageHeaderStory = &documentv6.Node{Type: "doc", Content: []documentv6.Node{{Type: "paragraph", Attrs: attrs(documentv6.ParagraphAttrs{ID: "first-header"}), Content: []documentv6.Node{{Type: "text", Text: "First"}}}}}
	layout, err := Resolve(context.Background(), doc, ResolveInput{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages) != 2 || layout.Pages[0].Blocks[0].Lines[0].Runs[0].FontSizePt != 24 || layout.Pages[0].Blocks[1].Lines[0].Runs[0].Text != "3. " || layout.Pages[0].Blocks[2].Lines[0].Runs[0].Text != "• " || layout.Pages[0].Blocks[2].X <= layout.Pages[0].Blocks[1].X {
		t.Fatalf("style or list projection failed: %+v", layout.Pages[0].Blocks)
	}
	if layout.Pages[0].Blocks[len(layout.Pages[0].Blocks)-1].Lines[0].Runs[0].Text != "First" {
		t.Fatal("first-page header was not selected")
	}
	last := layout.Pages[1].Blocks[len(layout.Pages[1].Blocks)-1]
	if last.Lines[0].Runs[1].Text != "2" || last.Lines[0].Runs[3].Text != "2" {
		t.Fatalf("page fields were not resolved: %+v", last.Lines)
	}
}

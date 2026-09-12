package documentv6

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestBlankRoundTrip(t *testing.T) {
	raw, err := json.Marshal(NewBlank("paragraph-1"))
	if err != nil {
		t.Fatal(err)
	}
	doc, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if doc.SchemaVersion != 6 || doc.Body.Content[0].Type != "paragraph" {
		t.Fatalf("unexpected document: %+v", doc)
	}
}

func TestStrictValidation(t *testing.T) {
	valid, _ := json.Marshal(NewBlank("paragraph-1"))
	tests := []struct{ name, raw string }{
		{"unknown document field", strings.Replace(string(valid), `"schema_version":6`, `"schema_version":6,"script":"bad"`, 1)},
		{"wrong schema", strings.Replace(string(valid), `"schema_version":6`, `"schema_version":5`, 1)},
		{"unknown node", strings.Replace(string(valid), `"type":"paragraph"`, `"type":"script"`, 1)},
		{"duplicate id", `{"schema_version":6,"settings":{"page_size":"A4","orientation":"portrait","margins":{"top":7200,"right":7200,"bottom":7200,"left":7200}},"body":{"type":"doc","content":[{"type":"paragraph","attrs":{"id":"x"}},{"type":"paragraph","attrs":{"id":"x"}}]}}`},
		{"remote image", `{"schema_version":6,"settings":{"page_size":"A4","orientation":"portrait","margins":{"top":7200,"right":7200,"bottom":7200,"left":7200}},"body":{"type":"doc","content":[{"type":"imageBlock","attrs":{"id":"i","source":"https://example.com/x.png","width":1000,"height":1000,"pixel_width":10,"pixel_height":10}}]}}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := Parse([]byte(tt.raw)); err == nil {
				t.Fatal("expected rejection")
			}
		})
	}
}

func TestSelectionMarksAndLineItemsValidate(t *testing.T) {
	doc := NewBlank("p")
	doc.Body.Content[0].Content = []Node{{Type: "text", Text: "important", Marks: []Mark{{Type: "bold"}, {Type: "textStyle", Attrs: mustJSON(TextStyleAttrs{FontFamily: "Quotier Sans", FontSize: 1200, Color: "#112233"})}, {Type: "highlight", Attrs: mustJSON(ColorAttrs{Color: "#ffff00"})}}}}
	doc.Body.Content = append(doc.Body.Content, Node{Type: "lineItemTable", Attrs: mustJSON(LineItemTableAttrs{ID: "items", Rows: []LineItem{{ID: "row-1", Description: "Service", Quantity: 2, Rate: 10000, TaxRate: 18}}})})
	raw, _ := json.Marshal(doc)
	if _, err := Parse(raw); err != nil {
		t.Fatal(err)
	}
}

func TestTableRowMinimumHeightValidation(t *testing.T) {
	cell := Node{Type: "tableCell", Attrs: mustJSON(TableCellAttrs{Colspan: 1, Rowspan: 1}), Content: []Node{{Type: "paragraph", Attrs: mustJSON(ParagraphAttrs{ID: "cell"})}}}
	doc := NewBlank("body")
	doc.Body.Content = []Node{{Type: "table", Attrs: mustJSON(TableAttrs{ID: "table", ColumnWidths: []int64{15000}}), Content: []Node{{Type: "tableRow", Attrs: mustJSON(TableRowAttrs{MinHeight: 4200}), Content: []Node{cell}}}}}
	raw, _ := json.Marshal(doc)
	if _, err := Parse(raw); err != nil {
		t.Fatal(err)
	}
	doc.Body.Content[0].Content[0].Attrs = mustJSON(TableRowAttrs{MinHeight: A4HeightDU + 1})
	raw, _ = json.Marshal(doc)
	if _, err := Parse(raw); err == nil {
		t.Fatal("expected oversized table row minimum height rejection")
	}
}

func TestPhase2StylesListsLinksAndStoriesValidate(t *testing.T) {
	doc := NewBlank("body")
	doc.Settings.DifferentFirstPage = true
	link := mustJSON(LinkAttrs{Href: "https://quotier.example/terms"})
	paragraph := Node{Type: "paragraph", Attrs: mustJSON(ParagraphAttrs{ID: "list-p", Style: "Terms", Alignment: "justify", LeftIndent: 1800, HangingIndent: 900}), Content: []Node{{Type: "text", Text: "Terms", Marks: []Mark{{Type: "strike"}, {Type: "link", Attrs: link}}}, {Type: "hardBreak"}, {Type: "text", Text: "apply\u00a0today"}}}
	item := Node{Type: "listItem", Attrs: mustJSON(IDAttrs{ID: "item"}), Content: []Node{paragraph}}
	doc.Body.Content = append(doc.Body.Content, Node{Type: "bulletList", Attrs: mustJSON(ListAttrs{ID: "list"}), Content: []Node{item}}, Node{Type: "horizontalRule", Attrs: mustJSON(IDAttrs{ID: "rule"})})
	doc.HeaderStory = &Node{Type: "doc", Content: []Node{{Type: "paragraph", Attrs: mustJSON(ParagraphAttrs{ID: "header"}), Content: []Node{{Type: "text", Text: "Page "}, {Type: "pageNumber"}, {Type: "text", Text: " of "}, {Type: "pageCount"}}}}}
	doc.FirstPageFooterStory = &Node{Type: "doc", Content: []Node{{Type: "paragraph", Attrs: mustJSON(ParagraphAttrs{ID: "first-footer"}), Content: []Node{{Type: "text", Text: "First page"}}}}}
	raw, _ := json.Marshal(doc)
	if _, err := Parse(raw); err != nil {
		t.Fatal(err)
	}
}

func TestPhase2RejectsUnsafeLinkDeepListAndAlteredStyle(t *testing.T) {
	tests := []func(*Document){
		func(doc *Document) {
			doc.Body.Content[0].Content = []Node{{Type: "text", Text: "bad", Marks: []Mark{{Type: "link", Attrs: mustJSON(LinkAttrs{Href: "javascript:alert(1)"})}}}}
		},
		func(doc *Document) { doc.Styles[0].FontSize = 1100 },
		func(doc *Document) {
			doc.Body.Content[0].Content = []Node{{Type: "text", Text: "bad", Marks: []Mark{{Type: "link", Attrs: mustJSON(LinkAttrs{Href: "https://"})}}}}
		},
		func(doc *Document) {
			child := Node{Type: "paragraph", Attrs: mustJSON(ParagraphAttrs{ID: "deep-p"})}
			for level := 4; level > 0; level-- {
				child = Node{Type: "bulletList", Attrs: mustJSON(ListAttrs{ID: fmt.Sprintf("list-%d", level)}), Content: []Node{{Type: "listItem", Attrs: mustJSON(IDAttrs{ID: fmt.Sprintf("item-%d", level)}), Content: []Node{child}}}}
			}
			doc.Body.Content = []Node{child}
		},
	}
	for index, mutate := range tests {
		doc := NewBlank("body")
		mutate(doc)
		raw, _ := json.Marshal(doc)
		if _, err := Parse(raw); err == nil {
			t.Fatalf("case %d was accepted", index)
		}
	}
}

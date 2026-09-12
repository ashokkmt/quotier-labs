package documentv6

import (
	"encoding/json"
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

package flowlayout

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"quotierlabs/backend/domain"
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

func TestPhase3FieldsSpansAndRepeatedLineItemHeaders(t *testing.T) {
	companyName := "ACME <script>alert(1)</script>"
	doc := documentv6.NewBlank("fields")
	doc.Body.Content[0].Content = []documentv6.Node{
		{Type: "field", Attrs: attrs(documentv6.FieldAttrs{ID: "company-field", Key: "company.name", EmptyBehavior: "diagnostic"})},
		{Type: "text", Text: " / "},
		{Type: "field", Attrs: attrs(documentv6.FieldAttrs{ID: "missing-field", Key: "customer.email", Fallback: "No email", EmptyBehavior: "fallback"})},
	}
	rows := make([]documentv6.LineItem, 80)
	for index := range rows {
		rows[index] = documentv6.LineItem{ID: fmt.Sprintf("item-%d", index), Description: "Professional service", Quantity: 1, Rate: 10000, TaxRate: 18}
	}
	doc.Body.Content = append(doc.Body.Content, documentv6.Node{Type: "lineItemTable", Attrs: attrs(documentv6.LineItemTableAttrs{ID: "items", Rows: rows, Columns: documentv6.DefaultLineItemColumns(), ShowTax: true, ShowGrandTotal: true})})
	quotation := &domain.Quotation{Number: "QT-1", AuditMetadata: domain.AuditMetadata{CreatedAt: time.Date(2026, 9, 13, 0, 0, 0, 0, time.UTC)}}
	layout, err := Resolve(context.Background(), doc, ResolveInput{Company: &domain.Company{Name: companyName}, Customer: &domain.Customer{}, Quotation: quotation}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := layout.Pages[0].Blocks[0].Lines[0].Runs[0].Text; got != companyName {
		t.Fatalf("field text changed: %q", got)
	}
	if got := layout.Pages[0].Blocks[0].Lines[0].Runs[2].Text; got != "No email" {
		t.Fatalf("fallback field = %q", got)
	}
	if len(layout.Pages) < 2 {
		t.Fatal("expected multi-page line items")
	}
	for pageIndex := 1; pageIndex < len(layout.Pages); pageIndex++ {
		found := false
		for _, block := range layout.Pages[pageIndex].Blocks {
			if strings.HasPrefix(block.ID, "items-repeat-") {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("page %d has no repeated line-item header", pageIndex+1)
		}
	}
}

func TestPhase3LargeLineItemTable(t *testing.T) {
	rows := make([]documentv6.LineItem, documentv6.MaxRows)
	for index := range rows {
		rows[index] = documentv6.LineItem{ID: fmt.Sprintf("large-item-%d", index), Description: "Service", Quantity: 1, Rate: 100, TaxRate: 18}
	}
	doc := documentv6.NewBlank("body")
	doc.Body.Content = []documentv6.Node{{Type: "lineItemTable", Attrs: attrs(documentv6.LineItemTableAttrs{ID: "large-items", Rows: rows})}}
	layout, err := Resolve(context.Background(), doc, ResolveInput{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages) < 10 || len(layout.Diagnostics) != 0 {
		t.Fatalf("large table did not paginate cleanly: pages=%d diagnostics=%+v", len(layout.Pages), layout.Diagnostics)
	}
}

func TestPhase3MissingFieldDiagnosticAndMergedCellGeometry(t *testing.T) {
	cell := func(id string, colspan, rowspan int) documentv6.Node {
		return documentv6.Node{Type: "tableCell", Attrs: attrs(documentv6.TableCellAttrs{Colspan: colspan, Rowspan: rowspan, Padding: 425}), Content: []documentv6.Node{{Type: "paragraph", Attrs: attrs(documentv6.ParagraphAttrs{ID: id}), Content: []documentv6.Node{{Type: "text", Text: id}}}}}
	}
	doc := documentv6.NewBlank("field")
	doc.Body.Content[0].Content = []documentv6.Node{{Type: "field", Attrs: attrs(documentv6.FieldAttrs{ID: "required", Key: "customer.gstin", EmptyBehavior: "diagnostic"})}}
	doc.Body.Content = append(doc.Body.Content, documentv6.Node{Type: "table", Attrs: attrs(documentv6.TableAttrs{ID: "table", ColumnWidths: []int64{10000, 10000}, Width: 20000, CellPadding: 425}), Content: []documentv6.Node{
		{Type: "tableRow", Content: []documentv6.Node{cell("merged", 2, 1)}},
		{Type: "tableRow", Content: []documentv6.Node{cell("left", 1, 1), cell("right", 1, 1)}},
	}})
	layout, err := Resolve(context.Background(), doc, ResolveInput{Customer: &domain.Customer{}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Diagnostics) != 1 || layout.Diagnostics[0].Code != "missing_field" {
		t.Fatalf("diagnostics=%+v", layout.Diagnostics)
	}
	merged := layout.Pages[0].Blocks[1].TableRows[0].Cells[0]
	if merged.Colspan != 2 || merged.Width <= layout.Pages[0].Blocks[2].TableRows[0].Cells[0].Width {
		t.Fatalf("merged geometry=%+v", merged)
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
	doc.Body.Content = []documentv6.Node{{Type: "table", Attrs: attrs(documentv6.TableAttrs{ID: "t", ColumnWidths: []int64{10000, 10000}, Alignment: "left", BorderColor: "#111827"}), Content: []documentv6.Node{{Type: "tableRow", Content: []documentv6.Node{cell("c1", "A"), cell("c2", "B")}}}}, {Type: "lineItemTable", Attrs: attrs(documentv6.LineItemTableAttrs{ID: "li", Rows: []documentv6.LineItem{{ID: "r1", Description: strings.Repeat("Long service description ", 8), Quantity: 2, Rate: 10000, TaxRate: 18}}})}}
	layout, err := Resolve(context.Background(), doc, ResolveInput{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Pages[0].Blocks) != 4 {
		t.Fatalf("blocks=%d", len(layout.Pages[0].Blocks))
	}
	if row := layout.Pages[0].Blocks[2]; row.Height <= 8 || len(row.TableRows[0].Cells[0].Lines) < 2 {
		t.Fatalf("long line-item content did not expand its row: %+v", row)
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

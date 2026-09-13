package pdf_test

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentv6"
	"quotierlabs/backend/infrastructure/pdf"
)

func TestV6PDFUsesOnlyAvailableManagedImages(t *testing.T) {
	root := t.TempDir()
	file, err := os.Create(filepath.Join(root, "image.png"))
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(file, solidImage()); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	doc := documentv6.NewBlank("p")
	doc.Assets = []documentv6.Asset{{Source: "asset:image.png", PixelWidth: 2, PixelHeight: 2}}
	doc.Body.Content = append(doc.Body.Content, documentv6.Node{Type: "imageBlock", Attrs: rawAttrs(documentv6.ImageAttrs{ID: "image", Source: "asset:image.png", Width: 2000, Height: 2000, PixelWidth: 2, PixelHeight: 2})})
	raw, _ := json.Marshal(doc)
	input := document.GeneratorInput{Quotation: &domain.Quotation{Document: string(raw)}}
	if _, err := pdf.NewGeneratorWithAssetRoot(root).Generate(context.Background(), input); err != nil {
		t.Fatal(err)
	}
	if _, err := pdf.NewGeneratorWithAssetRoot(t.TempDir()).Generate(context.Background(), input); err == nil {
		t.Fatal("expected a missing managed image to be rejected")
	}
}

func TestPhase3QuotationPDFFixture(t *testing.T) {
	root := t.TempDir()
	file, err := os.Create(filepath.Join(root, "logo.png"))
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(file, solidImage()); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	paragraph := func(id, text string) documentv6.Node {
		return documentv6.Node{Type: "paragraph", Attrs: rawAttrs(documentv6.ParagraphAttrs{ID: id}), Content: []documentv6.Node{{Type: "text", Text: text}}}
	}
	cell := func(id, text string, colspan int) documentv6.Node {
		return documentv6.Node{Type: "tableCell", Attrs: rawAttrs(documentv6.TableCellAttrs{Colspan: colspan, Rowspan: 1, Padding: 425}), Content: []documentv6.Node{paragraph(id, text)}}
	}
	heading := cell("terms-heading", "Terms", 2)
	heading.Type = "tableHeader"
	doc := documentv6.NewBlank("title")
	doc.Assets = []documentv6.Asset{{Source: "asset:logo.png", PixelWidth: 2, PixelHeight: 2}}
	doc.Body.Content[0].Content = []documentv6.Node{{Type: "field", Attrs: rawAttrs(documentv6.FieldAttrs{ID: "company-name", Key: "company.name", EmptyBehavior: "diagnostic"})}}
	doc.Body.Content = append(doc.Body.Content,
		documentv6.Node{Type: "imageBlock", Attrs: rawAttrs(documentv6.ImageAttrs{ID: "logo", Source: "asset:logo.png", Width: 3000, Height: 3000, PixelWidth: 2, PixelHeight: 2, AspectLock: true, Alt: "Company logo", SpaceAfter: 425})},
		documentv6.Node{Type: "table", Attrs: rawAttrs(documentv6.TableAttrs{ID: "terms", ColumnWidths: []int64{12000, 12000}, HeaderRows: 1, CellPadding: 425, BorderPreset: "all"}), Content: []documentv6.Node{
			{Type: "tableRow", Content: []documentv6.Node{heading}},
			{Type: "tableRow", Content: []documentv6.Node{cell("terms-left", "Payment", 1), cell("terms-right", "Due in 15 days", 1)}},
		}},
	)
	items := make([]documentv6.LineItem, 80)
	for index := range items {
		items[index] = documentv6.LineItem{ID: fmt.Sprintf("item-%d", index), Description: "Professional service", Quantity: 1, Rate: 10000, TaxRate: 18}
	}
	doc.Body.Content = append(doc.Body.Content, documentv6.Node{Type: "lineItemTable", Attrs: rawAttrs(documentv6.LineItemTableAttrs{ID: "items", Rows: items, Columns: documentv6.DefaultLineItemColumns(), ShowTax: true, ShowGrandTotal: true})})
	raw, _ := json.Marshal(doc)
	data, err := pdf.NewGeneratorWithAssetRoot(root).Generate(context.Background(), document.GeneratorInput{
		Quotation: &domain.Quotation{Document: string(raw)}, Company: &domain.Company{Name: "Phase 3 Company"}, Customer: &domain.Customer{Name: "Customer"},
	})
	if err != nil {
		t.Fatal(err)
	}
	text := extractPDFText(t, data)
	if pdfPageCount(t, data) < 2 || !strings.Contains(text, "Phase 3 Company") || strings.Count(text, "Description") < 2 {
		t.Fatalf("phase 3 fixture lost pagination, fields, or repeated headers: %q", text)
	}
}

func solidImage() image.Image {
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	for y := 0; y < 2; y++ {
		for x := 0; x < 2; x++ {
			img.Set(x, y, color.Black)
		}
	}
	return img
}

func rawAttrs(value any) json.RawMessage {
	raw, _ := json.Marshal(value)
	return raw
}

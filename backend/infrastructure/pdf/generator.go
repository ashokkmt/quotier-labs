package pdf

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"github.com/go-pdf/fpdf"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/quotation"
)

type generator struct {
}

func NewGenerator() document.PDFGenerator {
	return &generator{}
}

func (g *generator) Generate(ctx context.Context, input document.GeneratorInput) ([]byte, error) {
	version, err := quotation.DocumentSchemaVersion(input.Quotation.Document)
	if err != nil {
		return nil, fmt.Errorf("invalid document version: %w", err)
	}
	if version == documentmodel.SchemaVersion {
		return g.generateV5(ctx, input)
	}
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.SetAutoPageBreak(true, 15)
	pdf.AddPage()

	// Use standard fonts for now since embedding external fonts requires the TTF files
	pdf.SetFont("Arial", "", 10)

	doc, err := quotation.ParseDocument(input.Quotation.Document)
	if err != nil {
		return nil, fmt.Errorf("failed to parse document: %w", err)
	}

	layoutEngine := NewLayoutEngine(pdf, input)
	if err := layoutEngine.Render(doc); err != nil {
		return nil, fmt.Errorf("failed to render pdf: %w", err)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("failed to output pdf: %w", err)
	}

	return buf.Bytes(), nil
}

func (g *generator) generateV5(ctx context.Context, input document.GeneratorInput) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	doc, err := documentmodel.Parse([]byte(input.Quotation.Document))
	if err != nil {
		return nil, fmt.Errorf("parse V5 document: %w", err)
	}
	metrics := NewLayoutMetrics()
	ir, err := layoutir.ResolveWithMetrics(ctx, doc, layoutir.ResolveInput{
		Company: input.Company, Customer: input.Customer, Quotation: input.Quotation,
	}, metrics)
	if err != nil {
		return nil, fmt.Errorf("resolve V5 layout: %w", err)
	}
	pdf := fpdf.New("P", "mm", "A4", "")
	// Fixed metadata and sorted resource catalogs keep identical inputs byte-identical, making
	// finalized exports reproducible and enabling PDF regression fixtures.
	pdf.SetCatalogSort(true)
	pdf.SetCreationDate(time.Unix(0, 0).UTC())
	pdf.SetModificationDate(time.Unix(0, 0).UTC())
	pdf.SetFont("Arial", "", layoutir.DefaultFontSizePt)
	for _, page := range ir.Pages {
		pdf.AddPageFormat("P", fpdf.SizeType{Wd: page.Width, Ht: page.Height})
		for _, box := range page.Boxes {
			pdf.TransformBegin()
			if box.Rotation != 0 {
				pdf.TransformRotate(float64(box.Rotation)/100, box.X+box.Width/2, box.Y+box.Height/2)
			}
			if box.Shape != nil {
				drawShape(pdf, box)
			} else {
				// Non-shape boxes keep a hairline frame so authored rectangles are visible.
				pdf.Rect(box.X, box.Y, box.Width, box.Height, "D")
			}
			if box.Text != "" {
				drawText(pdf, box, metrics)
			}
			if box.Table != nil {
				pdf.ClipRect(box.X, box.Y, box.Width, box.Height, false)
				drawTable(pdf, box)
				pdf.ClipEnd()
			}
			if box.Image != nil {
				format := "PNG"
				if box.Image.MIME == "image/jpeg" {
					format = "JPG"
				}
				name := "v5-image-" + box.ID
				pdf.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: format, ReadDpi: true}, bytes.NewReader(box.Image.Data))
				if pdf.Error() != nil {
					return nil, fmt.Errorf("render image %s: %w", box.ID, pdf.Error())
				}
				pdf.ClipRect(box.X, box.Y, box.Width, box.Height, false)
				pdf.ImageOptions(name, box.X, box.Y, box.Width, box.Height, false, fpdf.ImageOptions{ImageType: format, ReadDpi: true}, 0, "")
				pdf.ClipEnd()
			}
			pdf.TransformEnd()
		}
	}
	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("output V5 pdf: %w", err)
	}
	return buf.Bytes(), nil
}

// colorRGB maps the closed token palette shared with the resolver and the TypeScript editor.
// Arbitrary colors never reach this adapter; tokens are enum-validated upstream.
var colorRGB = map[string][3]int{
	"black":   {17, 24, 39},
	"gray":    {107, 114, 128},
	"white":   {255, 255, 255},
	"primary": {37, 99, 235},
	"danger":  {220, 38, 38},
	"success": {22, 163, 74},
}

func applyTextColor(pdf *fpdf.Fpdf, token string) {
	rgb, ok := colorRGB[token]
	if !ok {
		rgb = colorRGB["black"]
	}
	pdf.SetTextColor(rgb[0], rgb[1], rgb[2])
}

func applyDrawColor(pdf *fpdf.Fpdf, token string) {
	rgb, ok := colorRGB[token]
	if !ok {
		rgb = colorRGB["black"]
	}
	pdf.SetDrawColor(rgb[0], rgb[1], rgb[2])
}

func applyFillColor(pdf *fpdf.Fpdf, token string) {
	rgb, ok := colorRGB[token]
	if !ok {
		rgb = colorRGB["black"]
	}
	pdf.SetFillColor(rgb[0], rgb[1], rgb[2])
}

func setDashPattern(pdf *fpdf.Fpdf, style string) {
	switch style {
	case "dashed":
		pdf.SetDashPattern([]float64{2, 1.5}, 0)
	case "dotted":
		pdf.SetDashPattern([]float64{0.6, 1.4}, 0)
	default:
		pdf.SetDashPattern([]float64{}, 0)
	}
}

// drawText paints a text box with its controlled size/weight/alignment/color tokens, clipped to
// the authored rectangle so overset content can never paint over another layer.
func drawText(pdf *fpdf.Fpdf, box layoutir.Box, metrics layoutir.Metrics) {
	style := ""
	if box.Bold {
		style = "B"
	}
	fontSize := box.FontSizePt
	if fontSize <= 0 {
		fontSize = layoutir.DefaultFontSizePt
	}
	pdf.SetFont("Arial", style, fontSize)
	applyTextColor(pdf, box.TextColor)
	align := map[string]string{"left": "L", "center": "C", "right": "R"}[box.Align]
	if align == "" {
		align = "L"
	}
	// Fixed and flow-frame content has an explicit document-owned rectangle. Clip the painter to
	// it so an overset diagnostic cannot paint over another layer.
	pdf.ClipRect(box.X, box.Y, box.Width, box.Height, false)
	pdf.SetXY(box.X, box.Y)
	pdf.MultiCell(box.Width, metrics.LineHeightMM(fontSize), box.Text, "", align, false)
	pdf.ClipEnd()
}

// drawShape paints a resolved shape with controlled fill/stroke tokens. Stroke dash patterns and
// widths come from validated enums; no arbitrary values are accepted.
func drawShape(pdf *fpdf.Fpdf, box layoutir.Box) {
	shape := box.Shape
	fillStyle := ""
	if shape.Fill != "" && shape.Fill != "none" {
		applyFillColor(pdf, shape.Fill)
		fillStyle = "F"
	}
	if shape.Stroke != nil && shape.Stroke.Color != "none" {
		applyDrawColor(pdf, shape.Stroke.Color)
		setDashPattern(pdf, shape.Stroke.Style)
		pdf.SetLineWidth(shape.Stroke.WidthPt * 25.4 / 72)
		fillStyle += "D"
	}
	switch shape.Variant {
	case "ellipse":
		pdf.Ellipse(box.X+box.Width/2, box.Y+box.Height/2, box.Width/2, box.Height/2, 0, fillStyle)
	case "line":
		pdf.SetLineWidth(lineWidthFor(shape))
		pdf.Line(box.X, box.Y+box.Height/2, box.X+box.Width, box.Y+box.Height/2)
	default:
		if fillStyle != "" {
			pdf.Rect(box.X, box.Y, box.Width, box.Height, fillStyle)
		}
	}
	pdf.SetDashPattern([]float64{}, 0)
}

func lineWidthFor(shape *layoutir.Shape) float64 {
	if shape == nil || shape.Stroke == nil || shape.Stroke.WidthPt <= 0 {
		return 0.35
	}
	return shape.Stroke.WidthPt * 25.4 / 72
}

// drawTable paints a resolved table fragment. Row height matches layoutir.TableRowHeightMM so
// fragment capacity and drawn output agree; the caller clips to the owning frame rectangle.
func drawTable(pdf *fpdf.Fpdf, box layoutir.Box) {
	table := box.Table
	if len(table.Headers) == 0 {
		return
	}
	cols := float64(len(table.Headers))
	width := box.Width / cols
	y := box.Y
	pdf.SetFont("Arial", "B", 8)
	x := box.X
	for _, header := range table.Headers {
		pdf.Rect(x, y, width, layoutir.TableRowHeightMM, "D")
		pdf.SetXY(x, y)
		pdf.CellFormat(width, layoutir.TableRowHeightMM, header, "", 0, "L", false, 0, "")
		x += width
	}
	y += layoutir.TableRowHeightMM
	pdf.SetFont("Arial", "", 8)
	for _, row := range table.Rows {
		x = box.X
		for i := 0; i < len(table.Headers); i++ {
			value := ""
			if i < len(row) {
				value = row[i]
			}
			pdf.Rect(x, y, width, layoutir.TableRowHeightMM, "D")
			pdf.SetXY(x, y)
			pdf.CellFormat(width, layoutir.TableRowHeightMM, value, "", 0, "L", false, 0, "")
			x += width
		}
		y += layoutir.TableRowHeightMM
	}
}

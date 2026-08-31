package pdf

import (
	"bytes"
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/go-pdf/fpdf"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain/documentmodel"
)

type generator struct {
}

func NewGenerator() document.PDFGenerator {
	return &generator{}
}

func (g *generator) Generate(ctx context.Context, input document.GeneratorInput) ([]byte, error) {
	return g.generateV5(ctx, input)
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

func resolveColor(value string) ([3]int, bool) {
	if value == "transparent" || value == "none" {
		return [3]int{}, false
	}
	if rgb, ok := colorRGB[value]; ok {
		return rgb, true
	}
	if len(value) == 7 && value[0] == '#' {
		parsed, err := strconv.ParseUint(value[1:], 16, 24)
		if err == nil {
			return [3]int{int(parsed >> 16), int((parsed >> 8) & 0xff), int(parsed & 0xff)}, true
		}
	}
	return colorRGB["black"], true
}

func applyTextColor(pdf *fpdf.Fpdf, value string) {
	rgb, _ := resolveColor(value)
	pdf.SetTextColor(rgb[0], rgb[1], rgb[2])
}

func applyDrawColor(pdf *fpdf.Fpdf, value string) {
	rgb, _ := resolveColor(value)
	pdf.SetDrawColor(rgb[0], rgb[1], rgb[2])
}

func applyFillColor(pdf *fpdf.Fpdf, value string) {
	rgb, _ := resolveColor(value)
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
	if _, visible := resolveColor(box.TextColor); !visible {
		return
	}
	style := ""
	if box.Bold || box.FontWeight >= 600 {
		style += "B"
	}
	if box.Italic {
		style += "I"
	}
	if box.Underline {
		style += "U"
	}
	fontSize := box.FontSizePt
	if fontSize <= 0 {
		fontSize = layoutir.DefaultFontSizePt
	}
	font := map[string]string{"sans": "Arial", "serif": "Times", "mono": "Courier"}[box.FontFamily]
	if font == "" {
		font = "Arial"
	}
	pdf.SetFont(font, style, fontSize)
	applyTextColor(pdf, box.TextColor)
	align := map[string]string{"left": "L", "center": "C", "right": "R"}[box.Align]
	if align == "" {
		align = "L"
	}
	padding := layoutir.TextPaddingMM
	contentWidth := box.Width - 2*padding
	contentHeight := box.Height - 2*padding
	if contentWidth < 0.1 {
		contentWidth = 0.1
	}
	if contentHeight < 0 {
		contentHeight = 0
	}
	textHeight := layoutir.MeasuredTextHeightMM(box.Text, contentWidth, fontSize, metrics)
	y := box.Y + padding
	switch box.VerticalAlign {
	case "middle":
		y += (contentHeight - textHeight) / 2
	case "bottom":
		y += contentHeight - textHeight
	}
	if y < box.Y+padding {
		y = box.Y + padding
	}
	// The frame is document geometry, not printable decoration. Clip text to it, but never draw
	// selection/editor outlines into Preview or exported PDFs.
	pdf.ClipRect(box.X, box.Y, box.Width, box.Height, false)
	pdf.SetXY(box.X+padding, y)
	pdf.MultiCell(contentWidth, metrics.LineHeightMM(fontSize), box.Text, "", align, false)
	pdf.ClipEnd()
}

// drawShape paints a resolved shape with controlled fill/stroke tokens. Stroke dash patterns and
// widths come from validated enums; no arbitrary values are accepted.
func drawShape(pdf *fpdf.Fpdf, box layoutir.Box) {
	shape := box.Shape
	fillStyle := ""
	if _, visible := resolveColor(shape.Fill); shape.Fill != "" && visible {
		applyFillColor(pdf, shape.Fill)
		fillStyle = "F"
	}
	if shape.Stroke != nil {
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
			radius := shape.CornerRadiusPt * 25.4 / 72
			if radius > box.Width/2 {
				radius = box.Width / 2
			}
			if radius > box.Height/2 {
				radius = box.Height / 2
			}
			if radius > 0 {
				pdf.RoundedRect(box.X, box.Y, box.Width, box.Height, radius, "1234", fillStyle)
			} else {
				pdf.Rect(box.X, box.Y, box.Width, box.Height, fillStyle)
			}
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

// drawTable paints the exact normalized table dimensions resolved by LayoutIR.
func drawTable(pdf *fpdf.Fpdf, box layoutir.Box) {
	table := box.Table
	if table == nil || table.ColumnCount < 1 {
		return
	}
	widths := table.ColumnWidthsMM
	if len(widths) != table.ColumnCount {
		widths = make([]float64, table.ColumnCount)
		for i := range widths {
			widths[i] = box.Width / float64(table.ColumnCount)
		}
	}
	rowHeight := table.RowHeightMM
	if rowHeight <= 0 {
		rowHeight = layoutir.TableRowHeightMM
	}
	y := box.Y
	if table.HeaderEnabled {
		pdf.SetFont("Arial", "B", 8)
		x := box.X
		for i := 0; i < table.ColumnCount; i++ {
			header := ""
			if i < len(table.Headers) {
				header = table.Headers[i]
			}
			pdf.Rect(x, y, widths[i], rowHeight, "D")
			pdf.SetXY(x, y)
			pdf.CellFormat(widths[i], rowHeight, header, "", 0, "L", false, 0, "")
			x += widths[i]
		}
		y += rowHeight
	}
	pdf.SetFont("Arial", "", 8)
	for _, row := range table.Rows {
		x := box.X
		for i := 0; i < table.ColumnCount; i++ {
			value := ""
			if i < len(row) {
				value = row[i]
			}
			pdf.Rect(x, y, widths[i], rowHeight, "D")
			pdf.SetXY(x, y)
			pdf.CellFormat(widths[i], rowHeight, value, "", 0, "L", false, 0, "")
			x += widths[i]
		}
		y += rowHeight
	}
}

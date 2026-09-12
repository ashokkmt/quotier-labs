package pdf

import (
	"bytes"
	"context"
	"fmt"
	"math"
	"strconv"
	"time"

	"github.com/go-pdf/fpdf"

	appdiagnostics "quotierlabs/backend/application/diagnostics"
	"quotierlabs/backend/application/document"
	"quotierlabs/backend/application/documentfonts"
	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain/documentformat"
	"quotierlabs/backend/domain/documentmodel"
)

type generator struct {
	recorder  appdiagnostics.Recorder
	assetRoot string
}

func NewGenerator(recorders ...appdiagnostics.Recorder) document.PDFGenerator {
	return NewGeneratorWithAssetRoot("", recorders...)
}

// NewGeneratorWithAssetRoot enables managed asset: references for V6 while retaining a
// path-free constructor for V5 and focused tests.
func NewGeneratorWithAssetRoot(assetRoot string, recorders ...appdiagnostics.Recorder) document.PDFGenerator {
	recorder := appdiagnostics.Recorder(appdiagnostics.NopRecorder{})
	if len(recorders) > 0 && recorders[0] != nil {
		recorder = recorders[0]
	}
	return &generator{recorder: recorder, assetRoot: assetRoot}
}

func (g *generator) Generate(ctx context.Context, input document.GeneratorInput) (out []byte, err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		g.recorder.RecordOperation(ctx, "pdf.generate", time.Since(started), result, nil)
	}()
	version, err := documentformat.Version([]byte(input.Quotation.Document))
	if err != nil {
		return nil, err
	}
	if version == 6 {
		return g.generateV6(ctx, input)
	}
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
	registerDocumentFonts(pdf)
	// LayoutIR already owns every physical page. Leaving fpdf's default automatic page breaking
	// enabled makes a fixed box near an authored page edge call AddPage from inside CellFormat,
	// splitting individual lines onto otherwise blank PDF pages and corrupting clip state.
	pdf.SetAutoPageBreak(false, 0)
	// CellFormat defaults to a 1 mm implicit horizontal margin. LayoutIR already resolves
	// every authored padding value, so retaining that library default shifts PDF glyphs
	// relative to shapes and makes editor/preview overlap geometry disagree.
	pdf.SetCellMargin(0)
	// Fixed metadata and sorted resource catalogs keep identical inputs byte-identical, making
	// finalized exports reproducible and enabling PDF regression fixtures.
	pdf.SetCatalogSort(true)
	pdf.SetCreationDate(time.Unix(0, 0).UTC())
	pdf.SetModificationDate(time.Unix(0, 0).UTC())
	pdf.SetFont(documentfonts.SansPDF, "", layoutir.DefaultFontSizePt)
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
				x, y, width, height := containImageRect(box)
				pdf.ClipRect(box.X, box.Y, box.Width, box.Height, false)
				pdf.ImageOptions(name, x, y, width, height, false, fpdf.ImageOptions{ImageType: format, ReadDpi: true}, 0, "")
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

// containImageRect mirrors CSS object-fit: contain with a centered object position. The complete
// source remains visible, preserves its aspect ratio, and never paints outside its authored frame.
func containImageRect(box layoutir.Box) (x, y, width, height float64) {
	if box.Image == nil || box.Image.PixelWidth <= 0 || box.Image.PixelHeight <= 0 {
		return box.X, box.Y, box.Width, box.Height
	}
	scale := math.Min(box.Width/float64(box.Image.PixelWidth), box.Height/float64(box.Image.PixelHeight))
	width = float64(box.Image.PixelWidth) * scale
	height = float64(box.Image.PixelHeight) * scale
	x = box.X + (box.Width-width)/2
	y = box.Y + (box.Height-height)/2
	return x, y, width, height
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

// drawText paints only the lines resolved by LayoutIR and clips to the exact persisted document
// frame used by the canvas. LayoutIR never substitutes a renderer-specific text geometry.
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
	fontSize := box.FontSizePt
	if fontSize <= 0 {
		fontSize = layoutir.DefaultFontSizePt
	}
	font, _ := pdfFont(layoutir.TextStyle{Family: box.FontFamily})
	pdf.SetFont(font, style, fontSize)
	applyTextColor(pdf, box.TextColor)
	align := map[string]string{"left": "L", "center": "C", "right": "R"}[box.Align]
	if align == "" {
		align = "L"
	}
	paddingX := layoutir.TextPaddingXMM
	paddingY := layoutir.TextPaddingYMM
	contentWidth := box.Width - 2*paddingX
	contentHeight := box.Height - 2*paddingY
	if contentWidth < 0.1 {
		contentWidth = 0.1
	}
	if contentHeight < 0 {
		contentHeight = 0
	}
	lines := box.TextLines
	if len(lines) == 0 && box.Text != "" {
		lines = []string{box.Text}
	}
	textHeight := float64(len(lines)) * metrics.LineHeightMM(fontSize)
	y := box.Y + paddingY
	switch box.VerticalAlign {
	case "middle":
		y += (contentHeight - textHeight) / 2
	case "bottom":
		y += contentHeight - textHeight
	}
	if y < box.Y+paddingY {
		y = box.Y + paddingY
	}
	// The frame is document geometry, not printable decoration. Clip text to it, but never draw
	// selection/editor outlines into Preview or exported PDFs.
	pdf.ClipRect(box.X, box.Y, box.Width, box.Height, false)
	for _, line := range lines {
		pdf.SetXY(box.X+paddingX, y)
		pdf.CellFormat(contentWidth, metrics.LineHeightMM(fontSize), line, "", 0, align, false, 0, "")
		if box.Underline && line != "" {
			drawTextUnderline(pdf, box, line, y, contentWidth, fontSize, metrics)
		}
		y += metrics.LineHeightMM(fontSize)
	}
	pdf.ClipEnd()
}

// drawTextUnderline avoids fpdf's built-in U style, whose font-specific underline position sits
// against glyphs in the bundled fonts. This controlled line matches the canvas decoration and is
// drawn per resolved line, so wrapping and alignment remain identical in both projections.
func drawTextUnderline(pdf *fpdf.Fpdf, box layoutir.Box, line string, lineY, contentWidth, fontSizePt float64, metrics layoutir.Metrics) {
	x, underlineY, width, thickness := textUnderlineGeometry(box, pdf.GetStringWidth(line), lineY, contentWidth, fontSizePt, metrics)
	applyDrawColor(pdf, box.TextColor)
	pdf.SetLineWidth(thickness)
	pdf.Line(x, underlineY, x+width, underlineY)
}

func textUnderlineGeometry(box layoutir.Box, width, lineY, contentWidth, fontSizePt float64, metrics layoutir.Metrics) (x, y, lineWidth, thickness float64) {
	x = box.X + layoutir.TextPaddingXMM
	switch box.Align {
	case "center":
		x += (contentWidth - width) / 2
	case "right":
		x += contentWidth - width
	}
	fontSizeMM := fontSizePt * 25.4 / 72
	baselineY := lineY + metrics.LineHeightMM(fontSizePt)/2 + 0.3*fontSizeMM
	underlineY := baselineY + layoutir.TextUnderlineOffsetEm*fontSizeMM
	underlineThickness := math.Max(0.5*25.4/72, layoutir.TextUnderlineThicknessEm*fontSizeMM)
	return x, underlineY, width, underlineThickness
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
	strokeInset := lineWidthFor(shape) / 2
	if shape.Stroke == nil {
		strokeInset = 0
	}
	x, y := box.X+strokeInset, box.Y+strokeInset
	width := math.Max(0.01, box.Width-2*strokeInset)
	height := math.Max(0.01, box.Height-2*strokeInset)
	switch shape.Variant {
	case "ellipse":
		pdf.Ellipse(x+width/2, y+height/2, width/2, height/2, 0, fillStyle)
	case "line":
		pdf.SetLineWidth(lineWidthFor(shape))
		pdf.Line(box.X, box.Y+box.Height/2, box.X+box.Width, box.Y+box.Height/2)
	default:
		if fillStyle != "" {
			radius := shape.CornerRadiusPt * 25.4 / 72
			if radius > width/2 {
				radius = width / 2
			}
			if radius > height/2 {
				radius = height / 2
			}
			if radius > 0 {
				pdf.RoundedRect(x, y, width, height, radius, "1234", fillStyle)
			} else {
				pdf.Rect(x, y, width, height, fillStyle)
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
	paddingX := layoutir.TableCellPaddingXPt * 25.4 / 72
	paddingY := layoutir.TableCellPaddingYPt * 25.4 / 72
	pdf.SetLineWidth(layoutir.TableBorderWidthPt * 25.4 / 72)
	pdf.SetDrawColor(75, 85, 99)
	pdf.SetTextColor(17, 24, 39)
	if table.HeaderEnabled {
		pdf.SetFont(documentfonts.SansPDF, "B", layoutir.TableFontSizePt)
		pdf.SetFillColor(243, 244, 246)
		x := box.X
		for i := 0; i < table.ColumnCount; i++ {
			header := ""
			if i < len(table.Headers) {
				header = table.Headers[i]
			}
			pdf.Rect(x, y, widths[i], rowHeight, "DF")
			pdf.ClipRect(x, y, widths[i], rowHeight, false)
			pdf.SetXY(x+paddingX, y+paddingY)
			pdf.CellFormat(maxFloat(0.1, widths[i]-2*paddingX), maxFloat(0.1, rowHeight-2*paddingY), header, "", 0, "L", false, 0, "")
			pdf.ClipEnd()
			x += widths[i]
		}
		y += rowHeight
	}
	pdf.SetFont(documentfonts.SansPDF, "", layoutir.TableFontSizePt)
	pdf.SetFillColor(255, 255, 255)
	for _, row := range table.Rows {
		x := box.X
		for i := 0; i < table.ColumnCount; i++ {
			value := ""
			if i < len(row) {
				value = row[i]
			}
			pdf.Rect(x, y, widths[i], rowHeight, "DF")
			pdf.ClipRect(x, y, widths[i], rowHeight, false)
			pdf.SetXY(x+paddingX, y+paddingY)
			pdf.CellFormat(maxFloat(0.1, widths[i]-2*paddingX), maxFloat(0.1, rowHeight-2*paddingY), value, "", 0, "L", false, 0, "")
			pdf.ClipEnd()
			x += widths[i]
		}
		y += rowHeight
	}
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

package pdf

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	_ "golang.org/x/image/webp"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/application/documentfonts"
	"quotierlabs/backend/application/flowlayout"
	"quotierlabs/backend/domain/documentv6"
	"quotierlabs/backend/infrastructure/assets"
)

func (g *generator) generateV6(ctx context.Context, input document.GeneratorInput) ([]byte, error) {
	doc, err := documentv6.Parse([]byte(input.Quotation.Document))
	if err != nil {
		return nil, fmt.Errorf("parse V6 document: %w", err)
	}
	layout, err := flowlayout.Resolve(ctx, doc, flowlayout.ResolveInput{Company: input.Company, Customer: input.Customer, Quotation: input.Quotation}, NewLayoutMetrics())
	if err != nil {
		return nil, fmt.Errorf("resolve V6 layout: %w", err)
	}
	pdf := fpdf.New("P", "mm", "A4", "")
	registerDocumentFonts(pdf)
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetCellMargin(0)
	pdf.SetCatalogSort(true)
	pdf.SetCreationDate(epoch)
	pdf.SetModificationDate(epoch)
	for _, page := range layout.Pages {
		pdf.AddPageFormat("P", fpdf.SizeType{Wd: page.Width, Ht: page.Height})
		for _, block := range page.Blocks {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			switch block.Kind {
			case "paragraph":
				drawV6Paragraph(pdf, block)
			case "horizontalRule":
				pdf.SetDrawColor(107, 114, 128)
				pdf.Line(block.X, block.Y+1.5, block.X+block.Width, block.Y+1.5)
			case "tableRow":
				drawV6TableRow(pdf, block)
			case "image":
				data, mime, loadErr := g.readManagedImage(block.Source)
				if loadErr != nil {
					return nil, fmt.Errorf("render image %s: %w", block.ID, loadErr)
				}
				format := "PNG"
				if mime == "image/jpeg" {
					format = "JPG"
				}
				name := "v6-image-" + block.ID
				pdf.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: format, ReadDpi: true}, bytes.NewReader(data))
				if pdf.Error() != nil {
					return nil, pdf.Error()
				}
				pdf.ImageOptions(name, block.X, block.Y+block.TextTop, block.Width, block.ContentHeight, false, fpdf.ImageOptions{ImageType: format, ReadDpi: true}, 0, "")
			}
		}
	}
	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("output V6 pdf: %w", err)
	}
	return buf.Bytes(), nil
}

var epoch = documentEpoch()

func documentEpoch() (value time.Time) { return time.Unix(0, 0).UTC() }

func drawV6Paragraph(pdf *fpdf.Fpdf, block flowlayout.Block) {
	y := block.Y
	for lineIndex, line := range block.Lines {
		lineWidth := 0.0
		lineHeight := 4.3
		for _, run := range line.Runs {
			family, style := v6Font(run)
			pdf.SetFont(family, style, run.FontSizePt)
			lineWidth += pdf.GetStringWidth(run.Text)
			lineHeight = max(lineHeight, run.FontSizePt*25.4/72*1.2)
		}
		x := block.X
		if lineIndex == 0 {
			x += block.FirstLine
		}
		if block.Align == "center" {
			x += (block.Width - lineWidth) / 2
		} else if block.Align == "right" {
			x += block.Width - lineWidth
		}
		extraSpace := 0.0
		if block.Align == "justify" && lineIndex < len(block.Lines)-1 {
			spaces := 0
			for _, run := range line.Runs {
				spaces += strings.Count(run.Text, " ")
			}
			if spaces > 0 && lineWidth < block.Width {
				extraSpace = (block.Width - lineWidth) / float64(spaces)
			}
		}
		for _, run := range line.Runs {
			family, style := v6Font(run)
			pdf.SetFont(family, style, run.FontSizePt)
			for _, glyph := range []rune(run.Text) {
				text := string(glyph)
				w := pdf.GetStringWidth(text)
				if run.Highlight != "" {
					rgb, _ := resolveColor(run.Highlight)
					pdf.SetFillColor(rgb[0], rgb[1], rgb[2])
					pdf.Rect(x, y+block.TextTop, w, lineHeight, "F")
				}
				applyTextColor(pdf, run.Color)
				baseline := y + block.TextTop + lineHeight*.78
				pdf.Text(x, baseline, text)
				if run.Strike {
					pdf.Line(x, baseline-lineHeight*.3, x+w, baseline-lineHeight*.3)
				}
				if run.Link != "" {
					pdf.LinkString(x, y+block.TextTop, w, lineHeight, run.Link)
				}
				x += w
				if glyph == ' ' {
					x += extraSpace
				}
			}
		}
		y += lineHeight
	}
}

func v6Font(run flowlayout.Run) (string, string) {
	family := documentfonts.SansPDF
	if run.FontFamily == "Quotier Serif" {
		family = documentfonts.SerifPDF
	} else if run.FontFamily == "Quotier Mono" {
		family = documentfonts.MonoPDF
	}
	style := ""
	if run.Bold {
		style += "B"
	}
	if run.Italic {
		style += "I"
	}
	if run.Underline {
		style += "U"
	}
	return family, style
}

func drawV6TableRow(pdf *fpdf.Fpdf, block flowlayout.Block) {
	if len(block.TableRows) == 0 {
		return
	}
	row := block.TableRows[0]
	for _, cell := range row.Cells {
		x := block.X
		for index := 0; index < cell.Column && index < len(block.Columns); index++ {
			x += block.Columns[index]
		}
		w := cell.Width
		if w <= 0 {
			w = block.Width / float64(len(row.Cells))
		}
		h := cell.Height
		if h <= 0 {
			h = block.Height
		}
		if cell.Background != "" && cell.Background != "transparent" {
			rgb, _ := resolveColor(cell.Background)
			pdf.SetFillColor(rgb[0], rgb[1], rgb[2])
			pdf.Rect(x, block.Y, w, h, "F")
		}
		if block.BorderPreset != "none" {
			rgb, _ := resolveColor(block.BorderColor)
			pdf.SetDrawColor(rgb[0], rgb[1], rgb[2])
			if block.BorderPreset == "all" {
				pdf.Rect(x, block.Y, w, h, "D")
			} else {
				if block.TableFirst {
					pdf.Line(x, block.Y, x+w, block.Y)
				}
				if block.TableLast {
					pdf.Line(x, block.Y+h, x+w, block.Y+h)
				}
				if cell.Column == 0 {
					pdf.Line(x, block.Y, x, block.Y+h)
				}
				if cell.Column+cell.Colspan == len(block.Columns) {
					pdf.Line(x+w, block.Y, x+w, block.Y+h)
				}
			}
		}
		contentHeight := tableCellContentHeight(cell)
		cellY := block.Y + cell.Padding
		if cell.VerticalAlign == "middle" {
			cellY += math.Max(0, (h-2*cell.Padding-contentHeight)/2)
		} else if cell.VerticalAlign == "bottom" {
			cellY += math.Max(0, h-2*cell.Padding-contentHeight)
		}
		drawV6TableCell(pdf, cell, x+cell.Padding, cellY, w-2*cell.Padding)
	}
}

func tableCellContentHeight(cell flowlayout.TableCell) float64 {
	height := 0.0
	for _, line := range cell.Lines {
		lineHeight := 4.3
		for _, run := range line.Runs {
			lineHeight = max(lineHeight, run.FontSizePt*25.4/72*1.2)
		}
		height += lineHeight
	}
	return height
}

func drawV6TableCell(pdf *fpdf.Fpdf, cell flowlayout.TableCell, x, y, width float64) {
	lineY := y
	for _, line := range cell.Lines {
		lineWidth := 0.0
		lineHeight := 4.3
		for _, run := range line.Runs {
			family, style := v6Font(run)
			pdf.SetFont(family, style, run.FontSizePt)
			lineWidth += pdf.GetStringWidth(run.Text)
			lineHeight = max(lineHeight, run.FontSizePt*25.4/72*1.2)
		}
		lineX := x
		if cell.Align == "center" {
			lineX += (width - lineWidth) / 2
		} else if cell.Align == "right" {
			lineX += width - lineWidth
		}
		for _, run := range line.Runs {
			family, style := v6Font(run)
			pdf.SetFont(family, style, run.FontSizePt)
			applyTextColor(pdf, run.Color)
			text := truncateToWidth(pdf, run.Text, width-(lineX-x))
			textWidth := pdf.GetStringWidth(text)
			baseline := lineY + lineHeight*.78
			if run.Highlight != "" {
				rgb, _ := resolveColor(run.Highlight)
				pdf.SetFillColor(rgb[0], rgb[1], rgb[2])
				pdf.Rect(lineX, lineY, textWidth, lineHeight, "F")
			}
			pdf.Text(lineX, baseline, text)
			if run.Strike {
				pdf.Line(lineX, baseline-lineHeight*.3, lineX+textWidth, baseline-lineHeight*.3)
			}
			if run.Link != "" {
				pdf.LinkString(lineX, lineY, textWidth, lineHeight, run.Link)
			}
			lineX += textWidth
		}
		lineY += lineHeight
	}
}

func truncateToWidth(pdf *fpdf.Fpdf, text string, width float64) string {
	if pdf.GetStringWidth(text) <= width {
		return text
	}
	r := []rune(text)
	for len(r) > 0 && pdf.GetStringWidth(string(r)+"…") > width {
		r = r[:len(r)-1]
	}
	return string(r) + "…"
}

func (g *generator) readManagedImage(source string) ([]byte, string, error) {
	if g.assetRoot == "" {
		return nil, "", fmt.Errorf("managed asset root is unavailable")
	}
	if !strings.HasPrefix(source, "asset:") {
		return nil, "", fmt.Errorf("invalid managed image reference")
	}
	name := strings.TrimPrefix(source, "asset:")
	if name == "" || filepath.Base(name) != name {
		return nil, "", fmt.Errorf("invalid managed image name")
	}
	path := filepath.Join(g.assetRoot, name)
	rel, err := filepath.Rel(g.assetRoot, path)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return nil, "", fmt.Errorf("managed image escaped asset root")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, "", fmt.Errorf("managed image is unavailable")
	}
	if err := assets.ValidateImage(data, filepath.Ext(name)); err != nil {
		return nil, "", err
	}
	mime := assets.MIMEForExtension(filepath.Ext(name))
	if mime != "image/webp" {
		return data, mime, nil
	}
	decoded, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", err
	}
	var out bytes.Buffer
	if err := png.Encode(&out, decoded); err != nil {
		return nil, "", err
	}
	return out.Bytes(), "image/png", nil
}

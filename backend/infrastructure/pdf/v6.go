package pdf

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/png"
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
				pdf.ImageOptions(name, block.X, block.Y, block.Width, block.Height, false, fpdf.ImageOptions{ImageType: format, ReadDpi: true}, 0, "")
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
		for _, run := range line.Runs {
			family, style := v6Font(run)
			pdf.SetFont(family, style, run.FontSizePt)
			lineWidth += pdf.GetStringWidth(run.Text)
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
		lineHeight := 4.3
		for _, run := range line.Runs {
			family, style := v6Font(run)
			pdf.SetFont(family, style, run.FontSizePt)
			w := pdf.GetStringWidth(run.Text)
			if run.Highlight != "" {
				rgb, _ := resolveColor(run.Highlight)
				pdf.SetFillColor(rgb[0], rgb[1], rgb[2])
				pdf.Rect(x, y, w, lineHeight, "F")
			}
			applyTextColor(pdf, run.Color)
			pdf.Text(x, y+block.TextTop+lineHeight*.78, run.Text)
			x += w
			if run.FontSizePt*25.4/72*1.2 > lineHeight {
				lineHeight = run.FontSizePt * 25.4 / 72 * 1.2
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
	x := block.X
	for i, cell := range row.Cells {
		w := block.Width / float64(len(row.Cells))
		if i < len(block.Columns) {
			w = block.Columns[i]
		}
		if cell.Background != "" && cell.Background != "transparent" {
			rgb, _ := resolveColor(cell.Background)
			pdf.SetFillColor(rgb[0], rgb[1], rgb[2])
			pdf.Rect(x, block.Y, w, block.Height, "F")
		}
		pdf.SetDrawColor(209, 213, 219)
		pdf.Rect(x, block.Y, w, block.Height, "D")
		drawV6TableCell(pdf, cell, x+1.5, block.Y+1, w-3)
		x += w
	}
}

func drawV6TableCell(pdf *fpdf.Fpdf, cell flowlayout.TableCell, x, y, width float64) {
	lineY := y
	for _, line := range cell.Lines {
		lineWidth := 0.0
		for _, run := range line.Runs {
			family, style := v6Font(run)
			pdf.SetFont(family, style, run.FontSizePt)
			lineWidth += pdf.GetStringWidth(run.Text)
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
			pdf.Text(lineX, lineY+run.FontSizePt*25.4/72, text)
			lineX += pdf.GetStringWidth(text)
		}
		lineY += 4.3
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

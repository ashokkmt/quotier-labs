package pdf

import (
	"bytes"
	"context"
	"fmt"

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
	ir, err := layoutir.ResolveWithInput(ctx, doc, layoutir.ResolveInput{
		Company: input.Company, Customer: input.Customer, Quotation: input.Quotation,
	})
	if err != nil {
		return nil, fmt.Errorf("resolve V5 layout: %w", err)
	}
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetFont("Arial", "", 10)
	for _, page := range ir.Pages {
		pdf.AddPageFormat("P", fpdf.SizeType{Wd: page.Width, Ht: page.Height})
		for _, box := range page.Boxes {
			pdf.TransformBegin()
			if box.Rotation != 0 {
				pdf.TransformRotate(float64(box.Rotation)/100, box.X+box.Width/2, box.Y+box.Height/2)
			}
			pdf.Rect(box.X, box.Y, box.Width, box.Height, "D")
			if box.Text != "" {
				// Fixed and flow-frame content has an explicit document-owned rectangle. Clip
				// the painter to it so an overset diagnostic cannot paint over another layer.
				pdf.ClipRect(box.X, box.Y, box.Width, box.Height, false)
				pdf.SetXY(box.X, box.Y)
				pdf.MultiCell(box.Width, 4, box.Text, "", "L", false)
				pdf.ClipEnd()
			}
			if box.Table != nil {
				drawTable(pdf, box)
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
				pdf.ImageOptions(name, box.X, box.Y, box.Width, box.Height, false, fpdf.ImageOptions{ImageType: format, ReadDpi: true}, 0, "")
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
		pdf.Rect(x, y, width, 5, "D")
		pdf.SetXY(x, y)
		pdf.CellFormat(width, 5, header, "", 0, "L", false, 0, "")
		x += width
	}
	y += 5
	pdf.SetFont("Arial", "", 8)
	for _, row := range table.Rows {
		x = box.X
		for i := 0; i < len(table.Headers); i++ {
			value := ""
			if i < len(row) {
				value = row[i]
			}
			pdf.Rect(x, y, width, 5, "D")
			pdf.SetXY(x, y)
			pdf.CellFormat(width, 5, value, "", 0, "L", false, 0, "")
			x += width
		}
		y += 5
	}
}

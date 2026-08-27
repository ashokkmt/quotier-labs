package pdf

import (
	"bytes"
	"context"
	"fmt"

	"github.com/go-pdf/fpdf"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain/quotation"
)

type generator struct {
}

func NewGenerator() document.PDFGenerator {
	return &generator{}
}

func (g *generator) Generate(ctx context.Context, input document.GeneratorInput) ([]byte, error) {
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

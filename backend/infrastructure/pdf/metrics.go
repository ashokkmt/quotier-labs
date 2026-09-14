package pdf

import (
	"github.com/go-pdf/fpdf"

	"quotierlabs/backend/application/documentfonts"
	"quotierlabs/backend/application/documentlayout"
)

// fpdfMetrics adapts the canonical embedded-font measurements to the renderer-neutral
// documentlayout.Metrics interface. It is deterministic: the same text and style always measure
// identically. Keeping the adapter in infrastructure lets the resolver stay fpdf-free while
// agreeing with the drawn output.
type fpdfMetrics struct {
	measure *fpdf.Fpdf
}

// NewLayoutMetrics supplies the production font metrics used for layout resolution.
func NewLayoutMetrics() documentlayout.Metrics {
	measure := fpdf.New("P", "mm", "A4", "")
	registerDocumentFonts(measure)
	measure.SetFont(documentfonts.SansPDF, "", documentlayout.DefaultFontSizePt)
	return &fpdfMetrics{measure: measure}
}

func pdfFont(style documentlayout.TextStyle) (string, string) {
	family := map[string]string{"sans": documentfonts.SansPDF, "serif": documentfonts.SerifPDF, "mono": documentfonts.MonoPDF}[style.Family]
	if family == "" {
		family = documentfonts.SansPDF
	}
	fontStyle := ""
	if style.Bold || style.Weight >= 600 {
		fontStyle += "B"
	}
	if style.Italic {
		fontStyle += "I"
	}
	return family, fontStyle
}

func (m *fpdfMetrics) withStyle(sizePt float64, style documentlayout.TextStyle) {
	family, fontStyle := pdfFont(style)
	m.measure.SetFont(family, fontStyle, sizePt)
}

func (m *fpdfMetrics) AverageCharWidthMM(sizePt float64, style documentlayout.TextStyle) float64 {
	m.withStyle(sizePt, style)
	return m.measure.GetStringWidth("nnnnnnnnnn") / 10
}

func (m *fpdfMetrics) LineHeightMM(sizePt float64) float64 {
	return sizePt * 25.4 / 72 * 1.2
}

func (m *fpdfMetrics) TextWidthMM(text string, sizePt float64, style documentlayout.TextStyle) float64 {
	m.withStyle(sizePt, style)
	return m.measure.GetStringWidth(text)
}

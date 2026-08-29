package pdf

import (
	"github.com/go-pdf/fpdf"

	"quotierlabs/backend/application/layoutir"
)

// fpdfMetrics adapts the fpdf core-font measurements to the renderer-neutral layoutir.Metrics
// interface. It is deterministic: the same text and size always measure identically. Keeping the
// adapter in infrastructure lets the resolver stay fpdf-free while agreeing with the drawn output.
type fpdfMetrics struct {
	measure *fpdf.Fpdf
}

// NewLayoutMetrics supplies the production font metrics used for layout resolution.
func NewLayoutMetrics() layoutir.Metrics {
	measure := fpdf.New("P", "mm", "A4", "")
	measure.SetFont("Arial", "", layoutir.DefaultFontSizePt)
	return &fpdfMetrics{measure: measure}
}

func (m *fpdfMetrics) withSize(sizePt float64) {
	m.measure.SetFontSize(sizePt)
}

func (m *fpdfMetrics) AverageCharWidthMM(sizePt float64) float64 {
	m.withSize(sizePt)
	return m.measure.GetStringWidth("nnnnnnnnnn") / 10
}

func (m *fpdfMetrics) LineHeightMM(sizePt float64) float64 {
	return sizePt * 25.4 / 72 * 1.2
}

func (m *fpdfMetrics) TextWidthMM(text string, sizePt float64) float64 {
	m.withSize(sizePt)
	return m.measure.GetStringWidth(text)
}

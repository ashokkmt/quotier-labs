package layoutir

import (
	"strings"
	"unicode/utf8"
)

// Metrics supplies deterministic font measurements so the resolver and the PDF adapter agree.
// Implementations must be pure: the same inputs always produce the same outputs. The resolver
// never imports fpdf; the infrastructure adapter injects its own implementation.
type Metrics interface {
	// AverageCharWidthMM reports the average glyph advance width in millimetres at sizePt.
	AverageCharWidthMM(sizePt float64) float64
	// LineHeightMM reports the baseline-to-baseline distance in millimetres at sizePt.
	LineHeightMM(sizePt float64) float64
	// TextWidthMM reports the rendered width of text in millimetres at sizePt.
	TextWidthMM(text string, sizePt float64) float64
}

// DefaultFontSizePt is the single font size used by both the resolver and the V5 PDF adapter.
const DefaultFontSizePt = 10

// DefaultMetrics is the deterministic fallback used when no adapter is injected. Its values match
// the 10pt core-font defaults used by the PDF generator so diagnostics and output agree.
type DefaultMetrics struct{}

func (DefaultMetrics) AverageCharWidthMM(sizePt float64) float64 {
	return sizePt * 25.4 / 72 * 0.55
}

func (DefaultMetrics) LineHeightMM(sizePt float64) float64 {
	return sizePt * 25.4 / 72 * 1.2
}

func (DefaultMetrics) TextWidthMM(text string, sizePt float64) float64 {
	return float64(utf8.RuneCountInString(text)) * DefaultMetrics{}.AverageCharWidthMM(sizePt)
}

// TableRowHeightMM is the fixed table row height shared by the resolver and the PDF adapter so
// fragment capacities and drawn rows stay in agreement.
const TableRowHeightMM = 5.0

// capacityFor reports how many average characters and how many lines fit in a box at sizePt.
func capacityFor(widthMM, heightMM, sizePt float64, m Metrics) (charsPerLine, lines int) {
	charsPerLine = int(widthMM / m.AverageCharWidthMM(sizePt))
	lines = int(heightMM / m.LineHeightMM(sizePt))
	if charsPerLine < 1 {
		charsPerLine = 1
	}
	if lines < 1 {
		lines = 1
	}
	return charsPerLine, lines
}

// wrapText greedily wraps text into lines that fit maxWidthMM at sizePt. Newlines are honored;
// a single word wider than the line occupies its own line. The result is deterministic.
func wrapText(text string, maxWidthMM, sizePt float64, m Metrics) []string {
	if text == "" {
		return nil
	}
	var lines []string
	for _, paragraph := range strings.Split(text, "\n") {
		words := strings.Fields(paragraph)
		if len(words) == 0 {
			lines = append(lines, "")
			continue
		}
		current := ""
		for _, word := range words {
			candidate := word
			if current != "" {
				candidate = current + " " + word
			}
			if m.TextWidthMM(candidate, sizePt) <= maxWidthMM || current == "" {
				current = candidate
				continue
			}
			lines = append(lines, current)
			current = word
		}
		if current != "" {
			lines = append(lines, current)
		}
	}
	return lines
}

// measuredHeightMM reports the height of wrapped text in millimetres at sizePt.
func measuredHeightMM(text string, maxWidthMM, sizePt float64, m Metrics) float64 {
	return float64(len(wrapText(text, maxWidthMM, sizePt, m))) * m.LineHeightMM(sizePt)
}

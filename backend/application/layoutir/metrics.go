package layoutir

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// Metrics supplies deterministic font measurements so the resolver and the PDF adapter agree.
// Implementations must be pure: the same inputs always produce the same outputs. The resolver
// never imports fpdf; the infrastructure adapter injects its own implementation.
type Metrics interface {
	// AverageCharWidthMM reports the average glyph advance width in millimetres at sizePt.
	AverageCharWidthMM(sizePt float64, style TextStyle) float64
	// LineHeightMM reports the baseline-to-baseline distance in millimetres at sizePt.
	LineHeightMM(sizePt float64) float64
	// TextWidthMM reports the rendered width of text in millimetres at sizePt.
	TextWidthMM(text string, sizePt float64, style TextStyle) float64
}

type TextStyle struct {
	Family string
	Weight int
	Bold   bool
	Italic bool
}

// DefaultFontSizePt is the single font size used by both the resolver and the V5 PDF adapter.
const DefaultFontSizePt = 10

const TextPaddingXPt = 0.0
const TextPaddingYPt = 1.0
const TextPaddingXMM = TextPaddingXPt * 25.4 / 72
const TextPaddingYMM = TextPaddingYPt * 25.4 / 72

// TextUnderlineOffsetEm and TextUnderlineThicknessEm define the controlled decoration geometry
// shared by the canvas and PDF projections. The offset deliberately clears glyph descenders.
const TextUnderlineOffsetEm = 0.23
const TextUnderlineThicknessEm = 0.055

func contentWidthMM(width float64) float64 {
	width -= 2 * TextPaddingXMM
	if width < 0.1 {
		return 0.1
	}
	return width
}

func contentHeightMM(height float64) float64 {
	height -= 2 * TextPaddingYMM
	if height < 0.1 {
		return 0.1
	}
	return height
}

// DefaultMetrics is a deterministic approximation used only when no renderer adapter is injected.
// Production preview/export injects the exact canonical embedded-font metrics.
type DefaultMetrics struct{}

func (DefaultMetrics) AverageCharWidthMM(sizePt float64, style TextStyle) float64 {
	factor := 0.55
	if style.Bold || style.Weight >= 600 {
		factor = 0.58
	}
	return sizePt * 25.4 / 72 * factor
}

func (DefaultMetrics) LineHeightMM(sizePt float64) float64 {
	return sizePt * 25.4 / 72 * 1.2
}

func (DefaultMetrics) TextWidthMM(text string, sizePt float64, style TextStyle) float64 {
	return float64(utf8.RuneCountInString(text)) * DefaultMetrics{}.AverageCharWidthMM(sizePt, style)
}

// Table defaults mirror frontend/table.ts. The minimum is a validation/clamping boundary, not the
// fallback row height for legacy stories.
const TableRowHeightMM = 8.0
const TableMinRowHeightMM = 5.0
const TableFontSizePt = 8.0
const TableCellPaddingXPt = 3.0
const TableCellPaddingYPt = 2.0
const TableBorderWidthPt = 0.5

// capacityFor reports how many average characters and how many lines fit in a box at sizePt.
func capacityFor(widthMM, heightMM, sizePt float64, style TextStyle, m Metrics) (charsPerLine, lines int) {
	charsPerLine = int(widthMM / m.AverageCharWidthMM(sizePt, style))
	lines = int((heightMM + 0.001) / m.LineHeightMM(sizePt))
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
func wrapText(text string, maxWidthMM, sizePt float64, style TextStyle, m Metrics) []string {
	if text == "" {
		return nil
	}
	var lines []string
	for _, paragraph := range strings.Split(text, "\n") {
		tokens := splitWrapTokens(paragraph)
		if len(tokens) == 0 {
			lines = append(lines, "")
			continue
		}
		current := ""
		for _, token := range tokens {
			candidate := current + token
			if m.TextWidthMM(candidate, sizePt, style) <= maxWidthMM {
				current = candidate
				continue
			}
			if current != "" {
				lines = append(lines, current)
			}
			if strings.TrimSpace(token) == "" {
				current = token
				continue
			}
			if m.TextWidthMM(token, sizePt, style) <= maxWidthMM {
				current = token
				continue
			}
			chunk := ""
			for _, r := range token {
				next := chunk + string(r)
				if chunk != "" && m.TextWidthMM(next, sizePt, style) > maxWidthMM {
					lines = append(lines, chunk)
					chunk = string(r)
				} else {
					chunk = next
				}
			}
			current = chunk
		}
		if current != "" {
			lines = append(lines, current)
		}
	}
	return lines
}

func splitWrapTokens(paragraph string) []string {
	var tokens []string
	var current []rune
	space := false
	for _, r := range paragraph {
		isSpace := unicode.IsSpace(r)
		if len(current) > 0 && isSpace != space {
			tokens = append(tokens, string(current))
			current = current[:0]
		}
		space = isSpace
		current = append(current, r)
	}
	if len(current) > 0 {
		tokens = append(tokens, string(current))
	}
	return tokens
}

// MeasuredTextHeightMM reports the height of wrapped text in millimetres at sizePt.
func MeasuredTextHeightMM(text string, maxWidthMM, sizePt float64, style TextStyle, m Metrics) float64 {
	return float64(len(wrapText(text, maxWidthMM, sizePt, style, m))) * m.LineHeightMM(sizePt)
}

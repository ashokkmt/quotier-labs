// Package documentlayout contains renderer-neutral measurements shared by the document editor,
// layout resolver, and PDF adapter.
package documentlayout

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

type Metrics interface {
	AverageCharWidthMM(sizePt float64, style TextStyle) float64
	LineHeightMM(sizePt float64) float64
	TextWidthMM(text string, sizePt float64, style TextStyle) float64
}

type TextStyle struct {
	Family string
	Weight int
	Bold   bool
	Italic bool
}

const DefaultFontSizePt = 10

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

func MeasuredTextHeightMM(text string, maxWidthMM, sizePt float64, style TextStyle, m Metrics) float64 {
	return float64(len(wrapText(text, maxWidthMM, sizePt, style, m))) * m.LineHeightMM(sizePt)
}

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
			if candidate := current + token; m.TextWidthMM(candidate, sizePt, style) <= maxWidthMM {
				current = candidate
				continue
			}
			if current != "" {
				lines = append(lines, current)
			}
			if strings.TrimSpace(token) == "" || m.TextWidthMM(token, sizePt, style) <= maxWidthMM {
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

package documentv6

import "fmt"

var StyleNames = []string{"Normal", "Title", "Heading 1", "Heading 2", "Body", "Terms", "Table Header", "Table Body", "Total"}

type StyleDefinition struct {
	Name          string  `json:"name"`
	FontFamily    string  `json:"font_family"`
	FontSize      int64   `json:"font_size"`
	Bold          bool    `json:"bold,omitempty"`
	Italic        bool    `json:"italic,omitempty"`
	Underline     bool    `json:"underline,omitempty"`
	Strike        bool    `json:"strike,omitempty"`
	Color         string  `json:"color"`
	Highlight     string  `json:"highlight,omitempty"`
	Alignment     string  `json:"alignment"`
	SpacingBefore int64   `json:"spacing_before,omitempty"`
	SpacingAfter  int64   `json:"spacing_after,omitempty"`
	LineHeight    float64 `json:"line_height"`
	LeftIndent    int64   `json:"left_indent,omitempty"`
	RightIndent   int64   `json:"right_indent,omitempty"`
}

type ResolvedStyle struct {
	StyleDefinition
	FirstLineIndent int64
	HangingIndent   int64
}

func StarterStyles() []StyleDefinition {
	return []StyleDefinition{
		{Name: "Normal", FontFamily: "Quotier Sans", FontSize: 1000, Color: "#111827", Alignment: "left", LineHeight: 1.2},
		{Name: "Title", FontFamily: "Quotier Sans", FontSize: 2400, Bold: true, Color: "#111827", Alignment: "center", SpacingAfter: 1200, LineHeight: 1.2},
		{Name: "Heading 1", FontFamily: "Quotier Sans", FontSize: 1800, Bold: true, Color: "#111827", Alignment: "left", SpacingBefore: 800, SpacingAfter: 600, LineHeight: 1.2},
		{Name: "Heading 2", FontFamily: "Quotier Sans", FontSize: 1400, Bold: true, Color: "#111827", Alignment: "left", SpacingBefore: 600, SpacingAfter: 400, LineHeight: 1.2},
		{Name: "Body", FontFamily: "Quotier Sans", FontSize: 1000, Color: "#111827", Alignment: "left", SpacingAfter: 600, LineHeight: 1.2},
		{Name: "Terms", FontFamily: "Quotier Serif", FontSize: 900, Color: "#374151", Alignment: "justify", SpacingAfter: 400, LineHeight: 1.2},
		{Name: "Table Header", FontFamily: "Quotier Sans", FontSize: 800, Bold: true, Color: "#111827", Alignment: "left", LineHeight: 1.1},
		{Name: "Table Body", FontFamily: "Quotier Sans", FontSize: 800, Color: "#111827", Alignment: "left", LineHeight: 1.1},
		{Name: "Total", FontFamily: "Quotier Sans", FontSize: 1000, Bold: true, Color: "#111827", Alignment: "right", SpacingBefore: 400, LineHeight: 1.2},
	}
}

func ValidStyleName(name string) bool {
	for _, allowed := range StyleNames {
		if name == allowed {
			return true
		}
	}
	return false
}

func validateStyles(styles []StyleDefinition) error {
	if len(styles) > len(StyleNames) {
		return invalid("too many named styles")
	}
	seen := map[string]bool{}
	builtins := StarterStyles()
	for _, style := range styles {
		if !ValidStyleName(style.Name) || seen[style.Name] || !oneOf(style.FontFamily, "Quotier Sans", "Quotier Serif", "Quotier Mono") || style.FontSize < 600 || style.FontSize > 7200 || !validColor(style.Color, false) || (style.Highlight != "" && !validColor(style.Highlight, false)) || !oneOf(style.Alignment, "left", "center", "right", "justify") || style.SpacingBefore < 0 || style.SpacingBefore > 7200 || style.SpacingAfter < 0 || style.SpacingAfter > 7200 || style.LineHeight < 1 || style.LineHeight > 3 || style.LeftIndent < 0 || style.RightIndent < 0 {
			return invalid("invalid named style")
		}
		matched := false
		for _, builtin := range builtins {
			if style == builtin {
				matched = true
				break
			}
		}
		if !matched {
			return invalid("named style differs from the controlled catalog")
		}
		seen[style.Name] = true
	}
	return nil
}

func ResolveParagraphStyle(doc *Document, attrs ParagraphAttrs) (ResolvedStyle, error) {
	styles := StarterStyles()
	for _, override := range doc.Styles {
		for i := range styles {
			if styles[i].Name == override.Name {
				styles[i] = override
			}
		}
	}
	name := attrs.Style
	if name == "" {
		name = "Normal"
	}
	var selected *StyleDefinition
	for i := range styles {
		if styles[i].Name == name {
			selected = &styles[i]
			break
		}
	}
	if selected == nil {
		return ResolvedStyle{}, fmt.Errorf("unknown paragraph style %q", name)
	}
	result := ResolvedStyle{StyleDefinition: *selected, FirstLineIndent: attrs.FirstLineIndent, HangingIndent: attrs.HangingIndent}
	if attrs.Alignment != "" {
		result.Alignment = attrs.Alignment
	}
	if attrs.SpacingBefore != 0 {
		result.SpacingBefore = attrs.SpacingBefore
	}
	if attrs.SpacingAfter != 0 {
		result.SpacingAfter = attrs.SpacingAfter
	}
	if attrs.LineHeight != 0 {
		result.LineHeight = attrs.LineHeight
	}
	if attrs.LeftIndent != 0 {
		result.LeftIndent = attrs.LeftIndent
	}
	if attrs.RightIndent != 0 {
		result.RightIndent = attrs.RightIndent
	}
	return result, nil
}

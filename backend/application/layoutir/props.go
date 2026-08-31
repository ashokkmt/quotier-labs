package layoutir

import (
	"encoding/json"
	"fmt"
	"regexp"

	"quotierlabs/backend/domain/documentmodel"
)

// ColorTokens is the closed palette shared with the TypeScript editor. Content cannot reference
// arbitrary colors, CSS, or markup — only these named tokens reach the PDF renderer.
var ColorTokens = map[string]bool{
	"black":   true,
	"gray":    true,
	"white":   true,
	"primary": true,
	"danger":  true,
	"success": true,
}

var textAligns = map[string]bool{"left": true, "center": true, "right": true}
var textVerticalAligns = map[string]bool{"top": true, "middle": true, "bottom": true}
var strokeStyles = map[string]bool{"solid": true, "dashed": true, "dotted": true}
var shapeVariants = map[string]bool{"rect": true, "ellipse": true, "line": true}
var fontFamilies = map[string]bool{"sans": true, "serif": true, "mono": true}
var fontWeights = map[int]bool{300: true, 400: true, 500: true, 600: true, 700: true}
var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

const (
	minFontSizePt   = 6
	maxFontSizePt   = 72
	minStrokeWidth  = 0.25
	maxStrokeWidth  = 12
	defaultStrokePt = 1
)

// controlledProps is the strict superset of widget props. Unknown JSON fields inside props are
// ignored here but the widgets themselves are closed; token values are enum-validated.
type controlledProps struct {
	FontSize      *float64 `json:"fontSize"`
	Bold          *bool    `json:"bold"`
	FontFamily    string   `json:"fontFamily"`
	FontWeight    *int     `json:"fontWeight"`
	Italic        *bool    `json:"italic"`
	Underline     *bool    `json:"underline"`
	Align         string   `json:"align"`
	VerticalAlign string   `json:"verticalAlign"`
	Color         string   `json:"color"`
	Variant       string   `json:"variant"`
	Fill          string   `json:"fill"`
	Stroke        string   `json:"stroke"`
	StrokeStyle   string   `json:"strokeStyle"`
	StrokeWidth   *float64 `json:"strokeWidth"`
	CornerRadius  *float64 `json:"cornerRadius"`
}

func validColor(value string, transparent bool) bool {
	return ColorTokens[value] || hexColor.MatchString(value) || (transparent && value == "transparent")
}

// applyControlledProps validates and projects text/shape styling tokens onto the box. Values are
// enum- and range-checked; hand-crafted documents cannot smuggle arbitrary values into the PDF.
func applyControlledProps(node documentmodel.Node, box *Box) error {
	if len(node.Props) == 0 {
		return nil
	}
	var props controlledProps
	if err := json.Unmarshal(node.Props, &props); err != nil {
		return err
	}
	if props.FontSize != nil {
		if *props.FontSize < minFontSizePt || *props.FontSize > maxFontSizePt {
			return fmt.Errorf("font size %v is out of bounds", *props.FontSize)
		}
		box.FontSizePt = *props.FontSize
	}
	if props.Bold != nil {
		box.Bold = *props.Bold
	}
	if props.FontFamily != "" {
		if !fontFamilies[props.FontFamily] {
			return fmt.Errorf("invalid font family %q", props.FontFamily)
		}
		box.FontFamily = props.FontFamily
	}
	if props.FontWeight != nil {
		if !fontWeights[*props.FontWeight] {
			return fmt.Errorf("invalid font weight %d", *props.FontWeight)
		}
		box.FontWeight = *props.FontWeight
		box.Bold = *props.FontWeight >= 600
	}
	if props.Italic != nil {
		box.Italic = *props.Italic
	}
	if props.Underline != nil {
		box.Underline = *props.Underline
	}
	if props.Align != "" {
		if !textAligns[props.Align] {
			return fmt.Errorf("invalid text alignment %q", props.Align)
		}
		box.Align = props.Align
	}
	if props.VerticalAlign != "" {
		if !textVerticalAligns[props.VerticalAlign] {
			return fmt.Errorf("invalid vertical text alignment %q", props.VerticalAlign)
		}
		box.VerticalAlign = props.VerticalAlign
	}
	if props.Color != "" {
		if !validColor(props.Color, true) {
			return fmt.Errorf("invalid text color value %q", props.Color)
		}
		box.TextColor = props.Color
	}
	if node.Kind == "shape" {
		variant := props.Variant
		if !shapeVariants[variant] {
			return fmt.Errorf("invalid shape variant %q", variant)
		}
		fill := props.Fill
		if fill != "" && fill != "none" && !validColor(fill, true) {
			return fmt.Errorf("invalid fill value %q", fill)
		}
		if fill == "" {
			fill = "none"
		}
		strokeColor := props.Stroke
		if strokeColor != "" && strokeColor != "none" && !validColor(strokeColor, true) {
			return fmt.Errorf("invalid stroke value %q", strokeColor)
		}
		if strokeColor == "" {
			strokeColor = "none"
		}
		style := props.StrokeStyle
		if style == "" {
			style = "solid"
		}
		if !strokeStyles[style] {
			return fmt.Errorf("invalid stroke style %q", style)
		}
		width := float64(defaultStrokePt)
		if props.StrokeWidth != nil {
			if *props.StrokeWidth < minStrokeWidth || *props.StrokeWidth > maxStrokeWidth {
				return fmt.Errorf("stroke width %v is out of bounds", *props.StrokeWidth)
			}
			width = *props.StrokeWidth
		}
		cornerRadius := float64(0)
		if props.CornerRadius != nil {
			if *props.CornerRadius < 0 || *props.CornerRadius > 200 {
				return fmt.Errorf("corner radius %v is out of bounds", *props.CornerRadius)
			}
			cornerRadius = *props.CornerRadius
		}
		if strokeColor == "none" || strokeColor == "transparent" {
			box.Shape = &Shape{Variant: variant, Fill: fill, CornerRadiusPt: cornerRadius}
		} else {
			box.Shape = &Shape{Variant: variant, Fill: fill, CornerRadiusPt: cornerRadius, Stroke: &Stroke{Color: strokeColor, Style: style, WidthPt: width}}
		}
	}
	return nil
}

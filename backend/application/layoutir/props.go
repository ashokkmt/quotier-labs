package layoutir

import (
	"encoding/json"
	"fmt"

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
var strokeStyles = map[string]bool{"solid": true, "dashed": true, "dotted": true}
var shapeVariants = map[string]bool{"rect": true, "ellipse": true, "line": true}

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
	FontSize    *float64 `json:"fontSize"`
	Bold        *bool    `json:"bold"`
	Align       string   `json:"align"`
	Color       string   `json:"color"`
	Variant     string   `json:"variant"`
	Fill        string   `json:"fill"`
	Stroke      string   `json:"stroke"`
	StrokeStyle string   `json:"strokeStyle"`
	StrokeWidth *float64 `json:"strokeWidth"`
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
	if props.Align != "" {
		if !textAligns[props.Align] {
			return fmt.Errorf("invalid text alignment %q", props.Align)
		}
		box.Align = props.Align
	}
	if props.Color != "" {
		if !ColorTokens[props.Color] {
			return fmt.Errorf("invalid text color token %q", props.Color)
		}
		box.TextColor = props.Color
	}
	if node.Kind == "shape" {
		variant := props.Variant
		if !shapeVariants[variant] {
			return fmt.Errorf("invalid shape variant %q", variant)
		}
		fill := props.Fill
		if fill != "" && fill != "none" && !ColorTokens[fill] {
			return fmt.Errorf("invalid fill token %q", fill)
		}
		if fill == "" {
			fill = "none"
		}
		strokeColor := props.Stroke
		if strokeColor != "" && strokeColor != "none" && !ColorTokens[strokeColor] {
			return fmt.Errorf("invalid stroke token %q", strokeColor)
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
		if strokeColor == "none" {
			box.Shape = &Shape{Variant: variant, Fill: fill}
		} else {
			box.Shape = &Shape{Variant: variant, Fill: fill, Stroke: &Stroke{Color: strokeColor, Style: style, WidthPt: width}}
		}
	}
	return nil
}

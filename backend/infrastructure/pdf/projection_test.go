package pdf

import (
	"math"
	"testing"

	"quotierlabs/backend/application/layoutir"
)

func TestContainImageRectMatchesCenteredCSSContain(t *testing.T) {
	box := layoutir.Box{
		X: 10, Y: 20, Width: 40, Height: 40,
		Image: &layoutir.Image{PixelWidth: 200, PixelHeight: 100},
	}
	x, y, width, height := containImageRect(box)
	if math.Abs(x-10) > 0.0001 || math.Abs(y-30) > 0.0001 ||
		math.Abs(width-40) > 0.0001 || math.Abs(height-20) > 0.0001 {
		t.Fatalf("landscape contain rect = (%v, %v, %v, %v)", x, y, width, height)
	}

	box.Image = &layoutir.Image{PixelWidth: 100, PixelHeight: 200}
	x, y, width, height = containImageRect(box)
	if math.Abs(x-20) > 0.0001 || math.Abs(y-20) > 0.0001 ||
		math.Abs(width-20) > 0.0001 || math.Abs(height-40) > 0.0001 {
		t.Fatalf("portrait contain rect = (%v, %v, %v, %v)", x, y, width, height)
	}
}

func TestDocumentFontsUseSameResourcesForMetricsAndDrawing(t *testing.T) {
	metrics := NewLayoutMetrics()
	styles := []layoutir.TextStyle{
		{Family: "sans"}, {Family: "sans", Weight: 700}, {Family: "sans", Italic: true},
		{Family: "serif"}, {Family: "serif", Weight: 700, Italic: true},
		{Family: "mono"},
	}
	for _, style := range styles {
		if width := metrics.TextWidthMM("Heading", 18, style); width <= 0 {
			t.Fatalf("font metrics unavailable for %+v", style)
		}
	}
}

func TestTextUnderlineClearsGlyphsAndHonorsAlignment(t *testing.T) {
	metrics := NewLayoutMetrics()
	box := layoutir.Box{X: 10, Width: 80, Align: "right"}
	fontSizePt := 20.0
	fontSizeMM := fontSizePt * 25.4 / 72
	lineY := 15.0
	contentWidth := 70.0
	x, y, width, thickness := textUnderlineGeometry(box, 25, lineY, contentWidth, fontSizePt, metrics)
	wantX := box.X + layoutir.TextPaddingXMM + contentWidth - 25
	baselineY := lineY + metrics.LineHeightMM(fontSizePt)/2 + 0.3*fontSizeMM
	if math.Abs(x-wantX) > 0.0001 || width != 25 {
		t.Fatalf("right-aligned underline geometry = x:%v width:%v", x, width)
	}
	if gap := y - baselineY; math.Abs(gap-layoutir.TextUnderlineOffsetEm*fontSizeMM) > 0.0001 || gap < 0.2*fontSizeMM {
		t.Fatalf("underline does not clear glyphs: baseline=%v underline=%v gap=%v", baselineY, y, gap)
	}
	if thickness < 0.5*25.4/72 {
		t.Fatalf("underline is too thin for reliable rendering: %v mm", thickness)
	}
}

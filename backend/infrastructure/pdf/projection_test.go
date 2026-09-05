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

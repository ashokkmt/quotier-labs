package pdf

import (
	"context"
	"strconv"
	"time"

	"github.com/go-pdf/fpdf"

	appdiagnostics "quotierlabs/backend/application/diagnostics"
	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain/documentformat"
)

type generator struct {
	recorder  appdiagnostics.Recorder
	assetRoot string
}

func NewGenerator(recorders ...appdiagnostics.Recorder) document.PDFGenerator {
	return NewGeneratorWithAssetRoot("", recorders...)
}

// NewGeneratorWithAssetRoot enables managed asset: references for V6.
func NewGeneratorWithAssetRoot(assetRoot string, recorders ...appdiagnostics.Recorder) document.PDFGenerator {
	recorder := appdiagnostics.Recorder(appdiagnostics.NopRecorder{})
	if len(recorders) > 0 && recorders[0] != nil {
		recorder = recorders[0]
	}
	return &generator{recorder: recorder, assetRoot: assetRoot}
}

func (g *generator) Generate(ctx context.Context, input document.GeneratorInput) (out []byte, err error) {
	started := time.Now()
	defer func() {
		result := "success"
		if err != nil {
			result = "error"
		}
		g.recorder.RecordOperation(ctx, "pdf.generate", time.Since(started), result, nil)
	}()
	if _, err := documentformat.Validate([]byte(input.Quotation.Document)); err != nil {
		return nil, err
	}
	return g.generateV6(ctx, input)
}

// colorRGB maps the closed token palette shared with the resolver and the TypeScript editor.
// Arbitrary colors never reach this adapter; tokens are enum-validated upstream.
var colorRGB = map[string][3]int{
	"black":   {17, 24, 39},
	"gray":    {107, 114, 128},
	"white":   {255, 255, 255},
	"primary": {37, 99, 235},
	"danger":  {220, 38, 38},
	"success": {22, 163, 74},
}

func resolveColor(value string) ([3]int, bool) {
	if value == "transparent" || value == "none" {
		return [3]int{}, false
	}
	if rgb, ok := colorRGB[value]; ok {
		return rgb, true
	}
	if len(value) == 7 && value[0] == '#' {
		parsed, err := strconv.ParseUint(value[1:], 16, 24)
		if err == nil {
			return [3]int{int(parsed >> 16), int((parsed >> 8) & 0xff), int(parsed & 0xff)}, true
		}
	}
	return colorRGB["black"], true
}

func applyTextColor(pdf *fpdf.Fpdf, value string) {
	rgb, _ := resolveColor(value)
	pdf.SetTextColor(rgb[0], rgb[1], rgb[2])
}

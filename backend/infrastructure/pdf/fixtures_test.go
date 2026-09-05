package pdf_test

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"unicode/utf16"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/infrastructure/pdf"
)

// --- fixture helpers ---------------------------------------------------------

// v5Fixture describes a representative V5 quotation used by the semantic regression tests.
type v5Fixture struct {
	Name     string
	Document *documentmodel.Document
	Company  *domain.Company
	Customer *domain.Customer
}

func v5TextFixture() v5Fixture {
	return v5Fixture{
		Name: "simple-text",
		Document: &documentmodel.Document{
			SchemaVersion: documentmodel.SchemaVersion,
			Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait"},
			Root: documentmodel.Root{Pages: []documentmodel.Page{{
				ID: "p1", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU,
				ChildIDs: []string{"title", "body"},
				Children: []documentmodel.Node{
					{ID: "title", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{X: 7200, Y: 7200, Width: 40000, Height: 4000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"Quotier Labs Quotation"}`)},
					{ID: "body", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{X: 7200, Y: 14000, Width: 40000, Height: 20000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"Standard terms apply to every quotation line."}`)},
				},
			}}},
		},
	}
}

func v5MultipageTableFixture() v5Fixture {
	rows := make([][]string, 0, 30)
	for i := 0; i < 30; i++ {
		rows = append(rows, []string{"Widget " + strconv.Itoa(i+1), strconv.Itoa(i+1) + "0.00"})
	}
	rowsJSON := marshalRows(rows)
	return v5Fixture{
		Name: "multipage-table",
		Document: &documentmodel.Document{
			SchemaVersion: documentmodel.SchemaVersion,
			Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait"},
			Stories: []documentmodel.Story{{
				ID: "line-items", Kind: "table",
				Content: []byte(`{"headers":["Item","Amount"],"rows":` + rowsJSON + `}`),
			}},
			Root: documentmodel.Root{Pages: []documentmodel.Page{{
				ID: "p1", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU,
				ChildIDs: []string{"items"},
				Children: []documentmodel.Node{
					{ID: "items", Kind: "flow-frame", Role: "flow-frame", StoryID: "line-items", Continuation: "auto-pages", Geometry: documentmodel.Geometry{X: 7200, Y: 7200, Width: 45000, Height: 20000}, LayoutMode: "flow-frame", Visibility: "shown"},
				},
			}}},
		},
	}
}

func marshalRows(rows [][]string) string {
	var sb strings.Builder
	sb.WriteByte('[')
	for i, row := range rows {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteByte('[')
		for j, cell := range row {
			if j > 0 {
				sb.WriteByte(',')
			}
			sb.WriteByte('"')
			sb.WriteString(cell)
			sb.WriteByte('"')
		}
		sb.WriteByte(']')
	}
	sb.WriteByte(']')
	return sb.String()
}

func v5MasterPageNumberFixture() v5Fixture {
	return v5Fixture{
		Name: "master-page-numbers",
		Document: &documentmodel.Document{
			SchemaVersion: documentmodel.SchemaVersion,
			Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait", DefaultMasterID: "footer-master"},
			Stories: []documentmodel.Story{{
				ID: "story", Kind: "rich-text",
				Content: []byte(`{"text":"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega"}`),
			}},
			Root: documentmodel.Root{
				Masters: []documentmodel.Master{{
					ID: "footer-master", ChildIDs: []string{"footer", "page-no"},
					Children: []documentmodel.Node{
						{ID: "footer", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{X: 7200, Y: 80000, Width: 20000, Height: 2000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"Quotier Footer"}`)},
						{ID: "page-no", Kind: "text", Role: "element", BindingKind: "calculation", Geometry: documentmodel.Geometry{X: 50000, Y: 80000, Width: 3000, Height: 2000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"binding":{"field":"page_number"}}`)},
					},
				}},
				Pages: []documentmodel.Page{{
					ID: "p1", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU,
					ChildIDs: []string{"frame"},
					Children: []documentmodel.Node{
						{ID: "frame", Kind: "flow-frame", Role: "flow-frame", StoryID: "story", Continuation: "auto-pages", Geometry: documentmodel.Geometry{X: 7200, Y: 7200, Width: 45000, Height: 30000}, LayoutMode: "flow-frame", Visibility: "shown"},
					},
				}},
			},
		},
	}
}

func v5ImageRotationFixture(t *testing.T) v5Fixture {
	t.Helper()
	uri := tinyPNGDataURI(t)
	return v5Fixture{
		Name: "image-rotation",
		Document: &documentmodel.Document{
			SchemaVersion: documentmodel.SchemaVersion,
			Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait"},
			Root: documentmodel.Root{Pages: []documentmodel.Page{{
				ID: "p1", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU,
				ChildIDs: []string{"logo", "stamp"},
				Children: []documentmodel.Node{
					{ID: "logo", Kind: "image", Role: "element", Geometry: documentmodel.Geometry{X: 7200, Y: 7200, Width: 8000, Height: 8000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"source":"` + uri + `"}`)},
					{ID: "stamp", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{X: 20000, Y: 20000, Width: 20000, Height: 4000, Rotation: 1500}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"Rotated Stamp"}`)},
				},
			}}},
		},
	}
}

func tinyPNGDataURI(t *testing.T) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 200, G: 30, B: 30, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

// --- semantic PDF parsing ----------------------------------------------------

var (
	streamRe     = regexp.MustCompile(`(?s)stream\r?\n(.*?)\r?\nendstream`)
	pdfStringRe  = regexp.MustCompile(`\(((?:[^()\\]|\\.)*)\)\s*Tj`)
	pageObjectRe = regexp.MustCompile(`/Type\s*/Page[^s]`)
	mediaBoxRe   = regexp.MustCompile(`/MediaBox\s*\[\s*0 0 ([0-9.]+) ([0-9.]+)\s*\]`)
)

// extractPDFText concatenates the text draw operations of every content stream in order.
func extractPDFText(t *testing.T, data []byte) string {
	t.Helper()
	var sb strings.Builder
	for _, match := range streamRe.FindAllSubmatch(data, -1) {
		zr, err := zlib.NewReader(bytes.NewReader(match[1]))
		if err != nil {
			continue // non-content streams (images, fonts) are not zlib text streams here
		}
		decompressed, err := io.ReadAll(zr)
		if err != nil {
			continue
		}
		for _, sm := range pdfStringRe.FindAllSubmatch(decompressed, -1) {
			sb.WriteString(decodePDFTestString(sm[1]))
		}
	}
	return sb.String()
}

// Embedded UTF-8 fonts are emitted as two-byte character identifiers. The fixture parser is
// deliberately small, but it must understand those identifiers instead of treating their zero
// high bytes as printable text.
func decodePDFTestString(encoded []byte) string {
	raw := bytes.ReplaceAll(encoded, []byte(`\(`), []byte("("))
	raw = bytes.ReplaceAll(raw, []byte(`\)`), []byte(")"))
	raw = bytes.ReplaceAll(raw, []byte(`\\`), []byte(`\`))
	if len(raw) < 2 || len(raw)%2 != 0 {
		return string(raw)
	}
	units := make([]uint16, 0, len(raw)/2)
	for index := 0; index < len(raw); index += 2 {
		units = append(units, uint16(raw[index])<<8|uint16(raw[index+1]))
	}
	return string(utf16.Decode(units))
}

func decodedContentStreams(t *testing.T, data []byte) []byte {
	t.Helper()
	var decoded []byte
	for _, match := range streamRe.FindAllSubmatch(data, -1) {
		zr, err := zlib.NewReader(bytes.NewReader(match[1]))
		if err != nil {
			continue
		}
		content, readErr := io.ReadAll(zr)
		_ = zr.Close()
		if readErr == nil {
			decoded = append(decoded, content...)
			decoded = append(decoded, '\n')
		}
	}
	return decoded
}

func findTextDrawX(t *testing.T, data []byte, value string) float64 {
	t.Helper()
	encoded := make([]byte, 0, len(value)*2)
	for _, unit := range utf16.Encode([]rune(value)) {
		encoded = append(encoded, byte(unit>>8), byte(unit))
	}
	pattern := regexp.MustCompile(`BT ([0-9.]+) [0-9.]+ Td \(` + regexp.QuoteMeta(string(encoded)) + `\)Tj`)
	match := pattern.FindSubmatch(decodedContentStreams(t, data))
	if match == nil {
		t.Fatalf("text draw operation for %q not found", value)
	}
	return mustFloat(t, string(match[1]))
}

func pdfPageCount(t *testing.T, data []byte) int {
	t.Helper()
	return len(pageObjectRe.FindAll(data, -1))
}

func assertA4PageSize(t *testing.T, data []byte) {
	t.Helper()
	match := mediaBoxRe.FindSubmatch(data)
	if match == nil {
		t.Fatalf("MediaBox not found in PDF")
	}
	width := mustFloat(t, string(match[1]))
	height := mustFloat(t, string(match[2]))
	if width < 594 || width > 596 || height < 841 || height > 843 {
		t.Fatalf("unexpected A4 page size %fx%f", width, height)
	}
}

func mustFloat(t *testing.T, s string) float64 {
	t.Helper()
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		t.Fatalf("bad number %q", s)
	}
	return v
}

func generateV5(t *testing.T, fixture v5Fixture) []byte {
	t.Helper()
	generator := pdf.NewGenerator()
	data, err := generator.Generate(context.Background(), document.GeneratorInput{
		Quotation: &domain.Quotation{ID: "q-" + fixture.Name, Number: "QT-2026-0001", Document: string(mustMarshal(t, fixture.Document))},
		Company:   fixture.Company,
		Customer:  fixture.Customer,
	})
	if err != nil {
		t.Fatalf("generate %s fixture: %v", fixture.Name, err)
	}
	if len(data) < 5 || string(data[:5]) != "%PDF-" {
		t.Fatalf("%s fixture did not produce a PDF", fixture.Name)
	}
	return data
}

func mustMarshal(t *testing.T, doc *documentmodel.Document) []byte {
	t.Helper()
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// --- fixtures ----------------------------------------------------------------

func TestV5FixtureSimpleTextSemantic(t *testing.T) {
	data := generateV5(t, v5TextFixture())
	if pages := pdfPageCount(t, data); pages != 1 {
		t.Fatalf("expected 1 page, got %d", pages)
	}
	assertA4PageSize(t, data)
	text := extractPDFText(t, data)
	if !strings.Contains(text, "Quotier Labs Quotation") || !strings.Contains(text, "Standard terms apply") {
		t.Fatalf("expected fixture text in PDF, got %q", text)
	}
	// Text geometry is an editor concern. Preview/export must never paint selection-like
	// rectangle strokes around otherwise borderless objects.
	if regexp.MustCompile(`(?m)\bre\s+S\b`).Match(decodedContentStreams(t, data)) {
		t.Fatal("text-only PDF contains an unexpected rectangle stroke")
	}
}

func TestV5FixtureMultipageTableRepeatsHeaders(t *testing.T) {
	data := generateV5(t, v5MultipageTableFixture())
	if pages := pdfPageCount(t, data); pages < 2 {
		t.Fatalf("expected multi-page table, got %d pages", pages)
	}
	text := extractPDFText(t, data)
	if got := strings.Count(text, "Item"); got < 2 {
		t.Fatalf("expected repeated headers on continuation pages, got %d occurrences", got)
	}
	for i := 1; i <= 30; i++ {
		if !strings.Contains(text, "Widget "+strconv.Itoa(i)) {
			t.Fatalf("missing row Widget %d in extracted text", i)
		}
	}
}

func TestV5FixtureMasterFooterAndPageNumbersOnEveryPage(t *testing.T) {
	data := generateV5(t, v5MasterPageNumberFixture())
	if pages := pdfPageCount(t, data); pages < 2 {
		t.Fatalf("expected derived continuation pages, got %d pages", pages)
	}
	text := extractPDFText(t, data)
	if got := strings.Count(text, "Quotier Footer"); got < 2 {
		t.Fatalf("expected master footer repeated on every page, got %d", got)
	}
	if !strings.Contains(text, "2") {
		t.Fatalf("expected page number 2 on derived page, got %q", text)
	}
}

func TestV5FixtureImageAndRotation(t *testing.T) {
	data := generateV5(t, v5ImageRotationFixture(t))
	if pages := pdfPageCount(t, data); pages != 1 {
		t.Fatalf("expected 1 page, got %d", pages)
	}
	if !bytes.Contains(data, []byte("/XObject")) && !bytes.Contains(data, []byte("/Image")) {
		t.Fatalf("expected embedded image object in PDF")
	}
	if !strings.Contains(extractPDFText(t, data), "Rotated Stamp") {
		t.Fatal("expected rotated text to be drawn")
	}
}

func TestV5FixtureOutputIsDeterministic(t *testing.T) {
	fixture := v5MultipageTableFixture()
	first := generateV5(t, fixture)
	for i := 0; i < 3; i++ {
		next := generateV5(t, fixture)
		if !bytes.Equal(first, next) {
			t.Fatal("identical V5 inputs produced different PDF bytes")
		}
	}
}

func TestV5FixtureRejectsUnsafeImages(t *testing.T) {
	build := func(source string) v5Fixture {
		fx := v5TextFixture()
		fx.Name = "unsafe-image"
		fx.Document.Root.Pages[0].ChildIDs = append(fx.Document.Root.Pages[0].ChildIDs, "img")
		fx.Document.Root.Pages[0].Children = append(fx.Document.Root.Pages[0].Children, documentmodel.Node{
			ID: "img", Kind: "image", Role: "element", LayoutMode: "fixed", Visibility: "shown",
			Geometry: documentmodel.Geometry{X: 1000, Y: 50000, Width: 10000, Height: 10000},
			Props:    []byte(`{"source":"` + source + `"}`),
		})
		return fx
	}
	// SVG is forbidden by the security model.
	svg := build("data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte("<svg/>")))
	if _, err := pdf.NewGenerator().Generate(context.Background(), document.GeneratorInput{
		Quotation: &domain.Quotation{ID: "q-svg", Document: string(mustMarshal(t, svg.Document))},
	}); err == nil {
		t.Fatal("expected SVG image source to be rejected")
	}
	// Oversized payloads are rejected before any decoder runs.
	big := strings.Repeat("A", 6<<20)
	oversized := build("data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte(big)))
	if _, err := pdf.NewGenerator().Generate(context.Background(), document.GeneratorInput{
		Quotation: &domain.Quotation{ID: "q-big", Document: string(mustMarshal(t, oversized.Document))},
	}); err == nil {
		t.Fatal("expected oversized image to be rejected")
	}
}

func v5ShapesAndStyledTextFixture() v5Fixture {
	return v5Fixture{
		Name: "shapes-styled-text",
		Document: &documentmodel.Document{
			SchemaVersion: documentmodel.SchemaVersion,
			Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait"},
			Root: documentmodel.Root{Pages: []documentmodel.Page{{
				ID: "p1", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU,
				ChildIDs: []string{"rect", "ellipse", "line", "heading", "body"},
				Children: []documentmodel.Node{
					{ID: "rect", Kind: "shape", Role: "element", Geometry: documentmodel.Geometry{X: 7200, Y: 7200, Width: 20000, Height: 10000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"variant":"rect","fill":"primary","stroke":"black","strokeStyle":"dashed","strokeWidth":2}`)},
					{ID: "ellipse", Kind: "shape", Role: "element", Geometry: documentmodel.Geometry{X: 32000, Y: 7200, Width: 10000, Height: 10000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"variant":"ellipse","fill":"danger"}`)},
					{ID: "line", Kind: "shape", Role: "element", Geometry: documentmodel.Geometry{X: 7200, Y: 22000, Width: 40000, Height: 200}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"variant":"line","fill":"none","stroke":"black","strokeWidth":1}`)},
					{ID: "heading", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{X: 7200, Y: 26000, Width: 40000, Height: 6000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"Styled Heading","fontSize":18,"bold":true,"align":"center","color":"primary"}`)},
					{ID: "body", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{X: 7200, Y: 34000, Width: 40000, Height: 8000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"text":"Body copy aligned right.","fontSize":11,"align":"right","color":"gray"}`)},
				},
			}}},
		},
	}
}

func TestV5FixtureShapesAndStyledText(t *testing.T) {
	data := generateV5(t, v5ShapesAndStyledTextFixture())
	if pages := pdfPageCount(t, data); pages != 1 {
		t.Fatalf("expected 1 page, got %d", pages)
	}
	text := extractPDFText(t, data)
	if !strings.Contains(text, "Styled Heading") || !strings.Contains(text, "Body copy aligned right.") {
		t.Fatalf("styled text missing from PDF: %q", text)
	}
	// Determinism must hold with shapes and styled text in the mix.
	again := generateV5(t, v5ShapesAndStyledTextFixture())
	if !bytes.Equal(data, again) {
		t.Fatal("shape fixture output is not deterministic")
	}
}

func TestV5TextKeepsTrailingGlyphsAfterLayoutResolution(t *testing.T) {
	values := []string{"Heading", "Subheading", "Text", "ending-g", "ending-j", "ending-p", "ending-q", "ending-y", "Punctuation! 123"}
	children := make([]documentmodel.Node, 0, len(values))
	childIDs := make([]string, 0, len(values))
	for index, value := range values {
		id := fmt.Sprintf("text-%d", index)
		childIDs = append(childIDs, id)
		children = append(children, documentmodel.Node{
			ID: id, Kind: "text", Role: "element",
			Geometry:   documentmodel.Geometry{X: 4000, Y: int64(4000 + index*3500), Width: 30000, Height: 2400},
			LayoutMode: "intrinsic", Visibility: "shown",
			Props: []byte(fmt.Sprintf(`{"text":%q,"fontSize":14,"bold":true,"sizingMode":"auto-width"}`, value)),
		})
	}
	fixture := v5Fixture{Name: "trailing-glyphs", Document: &documentmodel.Document{
		SchemaVersion: documentmodel.SchemaVersion,
		Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait"},
		Root:          documentmodel.Root{Pages: []documentmodel.Page{{ID: "p1", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU, ChildIDs: childIDs, Children: children}}},
	}}
	text := extractPDFText(t, generateV5(t, fixture))
	for _, value := range values {
		if !strings.Contains(text, value) {
			t.Fatalf("PDF lost trailing glyph from %q: extracted %q", value, text)
		}
	}
}

func TestV5TextDrawStartsAtAuthoredFrameWithoutLibraryCellMargin(t *testing.T) {
	const textXDU = 10000 // 100 pt
	fixture := v5Fixture{Name: "text-shape-overlap-origin", Document: &documentmodel.Document{
		SchemaVersion: documentmodel.SchemaVersion,
		Settings:      documentmodel.Settings{PageSize: "A4", Orientation: "portrait"},
		Root: documentmodel.Root{Pages: []documentmodel.Page{{
			ID: "p1", Width: documentmodel.A4WidthDU, Height: documentmodel.A4HeightDU,
			ChildIDs: []string{"text", "overlap"},
			Children: []documentmodel.Node{
				{ID: "text", Kind: "text", Role: "element", Geometry: documentmodel.Geometry{X: textXDU, Y: 10000, Width: 8100, Height: 1880}, LayoutMode: "intrinsic", Visibility: "shown", Props: []byte(`{"text":"Subheading","fontSize":14,"bold":true,"sizingMode":"auto-width"}`)},
				{ID: "overlap", Kind: "shape", Role: "element", Geometry: documentmodel.Geometry{X: 17600, Y: 9000, Width: 12000, Height: 8000}, LayoutMode: "fixed", Visibility: "shown", Props: []byte(`{"variant":"rect","fill":"primary"}`)},
			},
		}}},
	}}

	data := generateV5(t, fixture)
	if got := findTextDrawX(t, data, "Subheading"); math.Abs(got-100) > 0.01 {
		t.Fatalf("text started at %.2f pt, want authored x 100.00 pt", got)
	}
}

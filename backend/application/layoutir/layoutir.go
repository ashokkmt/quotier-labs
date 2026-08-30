// Package layoutir resolves the V5 scene graph into renderer-neutral physical boxes.
package layoutir

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
)

const DUPerMM = 7200.0 / 25.4

type affine [6]float64

var identityAffine = affine{1, 0, 0, 1, 0, 0}

func multiplyAffine(a, b affine) affine {
	return affine{
		a[0]*b[0] + a[2]*b[1],
		a[1]*b[0] + a[3]*b[1],
		a[0]*b[2] + a[2]*b[3],
		a[1]*b[2] + a[3]*b[3],
		a[0]*b[4] + a[2]*b[5] + a[4],
		a[1]*b[4] + a[3]*b[5] + a[5],
	}
}

func applyAffine(m affine, x, y float64) (float64, float64) {
	return m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]
}

func geometryAffine(g documentmodel.Geometry) affine {
	radians := float64(g.Rotation) / 100 * math.Pi / 180
	cosine, sine := math.Cos(radians), math.Sin(radians)
	cx, cy := float64(g.Width)/2, float64(g.Height)/2
	// T(x+center) · R · T(-center): document rotations use the box center.
	return affine{
		cosine,
		sine,
		-sine,
		cosine,
		float64(g.X) + cx - cosine*cx + sine*cy,
		float64(g.Y) + cy - sine*cx - cosine*cy,
	}
}

func geometryPosition(m affine, width, height int64, rotation int32) (float64, float64) {
	originX, originY := applyAffine(m, 0, 0)
	cx, cy := float64(width)/2, float64(height)/2
	radians := float64(rotation) / 100 * math.Pi / 180
	rotatedCX := math.Cos(radians)*cx - math.Sin(radians)*cy
	rotatedCY := math.Sin(radians)*cx + math.Cos(radians)*cy
	return originX - cx + rotatedCX, originY - cy + rotatedCY
}

type Diagnostic struct {
	Code    string `json:"code"`
	NodeID  string `json:"nodeId"`
	Message string `json:"message"`
}

// ResolveInput is the bounded data surface a document may bind to. It intentionally excludes
// filesystem paths, arbitrary map lookups, and expression evaluation.
type ResolveInput struct {
	Company   *domain.Company
	Customer  *domain.Customer
	Quotation *domain.Quotation
}

type Box struct {
	ID, Kind, Text       string
	StoryID              string
	Continuation         string
	ContinuationMasterID string
	Table                *TableFragment
	Image                *Image
	Shape                *Shape
	X, Y, Width, Height  float64
	Rotation             int32
	FontSizePt           float64
	Bold                 bool
	Align                string
	TextColor            string
}

// Shape carries the controlled fill/stroke tokens resolved from node props.
type Shape struct {
	Variant string
	Fill    string // color token or "none"
	Stroke  *Stroke
}

type Stroke struct {
	Color   string // color token or "none"
	Style   string // solid | dashed | dotted
	WidthPt float64
}
type TableFragment struct {
	Headers        []string
	Rows           [][]string
	RepeatedHeader bool
}
type Image struct {
	MIME string
	Data []byte
}
type Page struct {
	Width, Height float64
	Boxes         []Box
}
type Layout struct {
	Pages       []Page
	Diagnostics []Diagnostic
}

// maxDerivedPages bounds resource use for auto-pages continuation regardless of story content.
const maxDerivedPages = 100

func Resolve(doc *documentmodel.Document) (*Layout, error) {
	return ResolveWithInput(context.Background(), doc, ResolveInput{})
}

// ResolveWithInput resolves a V5 document into a deterministic, physical-unit scene. It checks
// cancellation between nodes and never treats document content as executable code or markup.
// Identical inputs always produce an identical Layout.
func ResolveWithInput(ctx context.Context, doc *documentmodel.Document, input ResolveInput) (*Layout, error) {
	return resolveWithMetrics(ctx, doc, input, DefaultMetrics{})
}

// ResolveWithMetrics resolves using an injected metrics adapter so that layout decisions match
// the renderer that will draw the IR. The adapter must be deterministic.
func ResolveWithMetrics(ctx context.Context, doc *documentmodel.Document, input ResolveInput, metrics Metrics) (*Layout, error) {
	if metrics == nil {
		metrics = DefaultMetrics{}
	}
	return resolveWithMetrics(ctx, doc, input, metrics)
}

func resolveWithMetrics(ctx context.Context, doc *documentmodel.Document, input ResolveInput, m Metrics) (*Layout, error) {
	if err := documentmodel.Validate(doc); err != nil {
		return nil, err
	}
	// Diagnostics is always non-nil so transport layers marshal a clean resolution as [] rather
	// than null, and callers can index it without nil checks.
	result := &Layout{Pages: make([]Page, 0, len(doc.Root.Pages)), Diagnostics: []Diagnostic{}}
	masters := make(map[string]documentmodel.Master, len(doc.Root.Masters))
	for _, master := range doc.Root.Masters {
		masters[master.ID] = master
	}
	for i, source := range doc.Root.Pages {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		page := Page{Width: float64(source.Width) / DUPerMM, Height: float64(source.Height) / DUPerMM}
		masterID := source.MasterID
		if masterID == "" {
			masterID = doc.Settings.DefaultMasterID
		}
		if masterID != "" {
			// Master elements paint behind the document page's own children.
			if err := addNodes(ctx, &page, &result.Diagnostics, masters[masterID].Children, identityAffine, 0, input, m, i+1); err != nil {
				return nil, err
			}
		}
		if err := addNodes(ctx, &page, &result.Diagnostics, source.Children, identityAffine, 0, input, m, i+1); err != nil {
			return nil, err
		}
		result.Pages = append(result.Pages, page)
	}
	if err := resolveFlowContent(ctx, result, doc, masters, input, m); err != nil {
		return nil, err
	}
	return result, nil
}

func addNodes(ctx context.Context, page *Page, diagnostics *[]Diagnostic, nodes []documentmodel.Node, parent affine, parentRotation int32, input ResolveInput, m Metrics, pageNumber int) error {
	for _, node := range nodes {
		if err := ctx.Err(); err != nil {
			return err
		}
		if node.Visibility == "hidden" {
			continue
		}
		matrix := multiplyAffine(parent, geometryAffine(node.Geometry))
		rotation := parentRotation + node.Geometry.Rotation
		if node.Role == "group" {
			if err := addNodes(ctx, page, diagnostics, node.Children, matrix, rotation, input, m, pageNumber); err != nil {
				return err
			}
			continue
		}
		text, err := resolveNodeText(node, input, pageNumber)
		if err != nil {
			if !node.Optional {
				return fmt.Errorf("node %s props: %w", node.ID, err)
			}
			// Optional content must not break the whole layout; it is reported instead.
			*diagnostics = append(*diagnostics, Diagnostic{Code: "unresolved_binding", NodeID: node.ID, Message: "optional content has an unresolved binding"})
			text = ""
		}
		x, y := geometryPosition(matrix, node.Geometry.Width, node.Geometry.Height, rotation)
		box := Box{ID: node.ID, Kind: node.Kind, Text: text, StoryID: node.StoryID, Continuation: node.Continuation, ContinuationMasterID: node.ContinuationMasterID, X: x / DUPerMM, Y: y / DUPerMM, Width: float64(node.Geometry.Width) / DUPerMM, Height: float64(node.Geometry.Height) / DUPerMM, Rotation: rotation, FontSizePt: DefaultFontSizePt, Align: "left", TextColor: "black"}
		if err := applyControlledProps(node, &box); err != nil {
			return fmt.Errorf("node %s props: %w", node.ID, err)
		}
		if node.Kind == "image" {
			image, err := resolveImage(node.Props)
			if err != nil {
				return fmt.Errorf("node %s image: %w", node.ID, err)
			}
			box.Image = image
		}
		switch {
		case node.Role != "flow-frame" && node.LayoutMode == "intrinsic" && text != "":
			// Intrinsic text has authored width and measured height; it may grow only inside
			// the page bounds. The resolved box reports the measured height.
			height := measuredHeightMM(text, box.Width, DefaultFontSizePt, m)
			if height > box.Height {
				box.Height = height
			}
			if box.Y+box.Height > page.Height {
				*diagnostics = append(*diagnostics, Diagnostic{Code: "intrinsic_overflow", NodeID: node.ID, Message: "intrinsic text grows beyond the page bounds"})
			}
		case node.Role != "flow-frame" && text != "":
			// Fixed text is never silently clipped: overset is reported.
			if needed := float64(len(wrapText(text, box.Width, box.FontSizePt, m))) * m.LineHeightMM(box.FontSizePt); needed > box.Height {
				*diagnostics = append(*diagnostics, Diagnostic{Code: "overset_text", NodeID: node.ID, Message: "fixed text exceeds its authored box"})
			}
		}
		page.Boxes = append(page.Boxes, box)
	}
	return nil
}

func resolveImage(raw json.RawMessage) (*Image, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var props struct {
		Source string `json:"source"`
	}
	if err := json.Unmarshal(raw, &props); err != nil {
		return nil, err
	}
	if props.Source == "" {
		return nil, nil
	}
	const prefix = "data:image/"
	if !strings.HasPrefix(props.Source, prefix) {
		return nil, fmt.Errorf("image source must be an inline PNG or JPEG data URI")
	}
	parts := strings.SplitN(props.Source, ",", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("malformed image data URI")
	}
	mime := strings.TrimSuffix(strings.TrimPrefix(parts[0], "data:"), ";base64")
	if mime != "image/png" && mime != "image/jpeg" {
		return nil, fmt.Errorf("unsupported image MIME type")
	}
	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil || len(data) == 0 || len(data) > 5<<20 {
		return nil, fmt.Errorf("invalid or oversized image data")
	}
	return &Image{MIME: mime, Data: data}, nil
}

func resolveNodeText(node documentmodel.Node, input ResolveInput, pageNumber int) (string, error) {
	if len(node.Props) == 0 {
		return "", nil
	}
	var props struct {
		Text    string `json:"text"`
		Value   string `json:"value"`
		Binding *struct {
			Field string `json:"field"`
		} `json:"binding"`
	}
	if err := json.Unmarshal(node.Props, &props); err != nil {
		return "", err
	}
	if node.BindingKind == "" || node.BindingKind == "literal" {
		if props.Text != "" {
			return props.Text, nil
		}
		return props.Value, nil
	}
	if props.Binding == nil || props.Binding.Field == "" {
		return "", fmt.Errorf("missing controlled binding")
	}
	if node.BindingKind == "calculation" && props.Binding.Field == "page_number" {
		return strconv.Itoa(pageNumber), nil
	}
	value, ok := resolveBinding(node.BindingKind, props.Binding.Field, input)
	if !ok {
		return "", fmt.Errorf("unsupported %s binding %q", node.BindingKind, props.Binding.Field)
	}
	return value, nil
}

func resolveBinding(kind, field string, input ResolveInput) (string, bool) {
	if kind == "company" && input.Company != nil {
		switch field {
		case "name":
			return input.Company.Name, true
		case "email":
			return deref(input.Company.Email), true
		case "phone":
			return deref(input.Company.Phone), true
		case "address":
			return deref(input.Company.Address), true
		case "gstin":
			return deref(input.Company.GSTIN), true
		}
	}
	if kind == "customer" && input.Customer != nil {
		switch field {
		case "name":
			return input.Customer.Name, true
		case "email":
			return deref(input.Customer.Email), true
		case "phone":
			return deref(input.Customer.Phone), true
		case "address":
			return deref(input.Customer.Address), true
		case "gstin":
			return deref(input.Customer.GSTIN), true
		}
	}
	if kind == "quotation" && input.Quotation != nil {
		switch field {
		case "number":
			return input.Quotation.Number, true
		case "status":
			return input.Quotation.Status, true
		case "notes":
			return deref(input.Quotation.Notes), true
		}
	}
	if kind == "calculation" && input.Quotation != nil {
		switch field {
		case "subtotal":
			return fmt.Sprint(input.Quotation.Subtotal), true
		case "grand_total":
			return fmt.Sprint(input.Quotation.GrandTotal), true
		case "taxable_total":
			return fmt.Sprint(input.Quotation.TaxableTotal), true
		}
	}
	return "", false
}
func deref(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

// resolveFlowContent fills flow frames with story fragments in deterministic page/paint order,
// then derives continuation pages for `auto-pages` frames. Derived pages and fragments exist only
// in the resolved layout; the persisted document is never mutated.
func resolveFlowContent(ctx context.Context, layout *Layout, doc *documentmodel.Document, masters map[string]documentmodel.Master, input ResolveInput, m Metrics) error {
	for _, story := range doc.Stories {
		if err := ctx.Err(); err != nil {
			return err
		}
		if story.Kind == "table" {
			fillTableStory(ctx, layout, doc, masters, story, input, m)
			continue
		}
		var value struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal(story.Content, &value); err != nil {
			continue
		}
		fillTextStory(ctx, layout, doc, masters, story.ID, value.Text, input, m)
	}
	return nil
}

func fillTextStory(ctx context.Context, layout *Layout, doc *documentmodel.Document, masters map[string]documentmodel.Master, storyID, text string, input ResolveInput, m Metrics) {
	remaining := text
	for pi := range layout.Pages {
		if remaining == "" {
			return
		}
		for bi := range layout.Pages[pi].Boxes {
			box := &layout.Pages[pi].Boxes[bi]
			if box.StoryID != storyID || remaining == "" {
				continue
			}
			remaining = fillTextBox(box, remaining, m)
		}
	}
	deriveContinuationPages(ctx, layout, doc, masters, storyID, func(fragment *Box, m Metrics) bool {
		next := remaining
		remaining = ""
		remaining = fillTextBox(fragment, next, m)
		return remaining == ""
	}, input, m)
	if remaining != "" {
		layout.Diagnostics = append(layout.Diagnostics, Diagnostic{Code: "overset_story", NodeID: storyID, Message: "story content does not fit its available flow frames"})
	}
}

// fillTextBox writes as much text as fits into the box and returns the remainder.
func fillTextBox(box *Box, text string, m Metrics) string {
	if text == "" {
		return ""
	}
	_, fitsLines := capacityFor(box.Width, box.Height, box.FontSizePt, m)
	wrapped := wrapText(text, box.Width, box.FontSizePt, m)
	if len(wrapped) <= fitsLines {
		box.Text = text
		return ""
	}
	box.Text = strings.Join(wrapped[:fitsLines], " ")
	return strings.Join(wrapped[fitsLines:], " ")
}

type tableStory struct {
	Headers []string   `json:"headers"`
	Rows    [][]string `json:"rows"`
}

func fillTableStory(ctx context.Context, layout *Layout, doc *documentmodel.Document, masters map[string]documentmodel.Master, story documentmodel.Story, input ResolveInput, m Metrics) {
	var table tableStory
	if err := json.Unmarshal(story.Content, &table); err != nil {
		return
	}
	if len(table.Headers) == 0 {
		return
	}
	row := 0
	for pi := range layout.Pages {
		for bi := range layout.Pages[pi].Boxes {
			box := &layout.Pages[pi].Boxes[bi]
			if box.StoryID != story.ID {
				continue
			}
			fragment, next := tableFragment(box, table, row)
			box.Table = fragment
			row = next
		}
	}
	if row >= len(table.Rows) {
		return
	}
	deriveContinuationPages(ctx, layout, doc, masters, story.ID, func(fragment *Box, m Metrics) bool {
		f, next := tableFragment(fragment, table, row)
		fragment.Table = f
		row = next
		return row >= len(table.Rows)
	}, input, m)
	if row < len(table.Rows) {
		layout.Diagnostics = append(layout.Diagnostics, Diagnostic{Code: "overset_table", NodeID: story.ID, Message: "table rows do not fit their available flow frames"})
	}
}

// tableFragment returns the fragment for the next rows of a table inside a frame and the next
// unconsumed row index. Headers repeat on every fragment after the first.
func tableFragment(box *Box, table tableStory, row int) (*TableFragment, int) {
	rowsPerFrame := int((box.Height - TableRowHeightMM) / TableRowHeightMM)
	if rowsPerFrame < 1 {
		rowsPerFrame = 1
	}
	end := row + rowsPerFrame
	if end > len(table.Rows) {
		end = len(table.Rows)
	}
	return &TableFragment{Headers: table.Headers, Rows: table.Rows[row:end], RepeatedHeader: row > 0}, end
}

// deriveContinuationPages appends derived pages while fill reports unfinished content and an
// earlier frame declared `auto-pages`. fill receives a copy of the continuation frame, fills it,
// and returns true when the story is exhausted. The persisted document is never touched.
func deriveContinuationPages(ctx context.Context, layout *Layout, doc *documentmodel.Document, masters map[string]documentmodel.Master, storyID string, fill func(fragment *Box, m Metrics) bool, input ResolveInput, m Metrics) {
	for pageCount := 0; pageCount < maxDerivedPages; pageCount++ {
		if err := ctx.Err(); err != nil {
			break
		}
		_, frame, ok := continuationFrame(layout, storyID)
		if !ok {
			break
		}
		page := Page{Width: layout.Pages[len(layout.Pages)-1].Width, Height: layout.Pages[len(layout.Pages)-1].Height}
		pageNumber := len(layout.Pages) + 1
		masterID := frame.ContinuationMasterID
		if masterID == "" {
			masterID = doc.Settings.DefaultMasterID
		}
		if masterID != "" {
			// Derived continuation pages repeat the chosen page master, including page numbers.
			if err := addNodes(ctx, &page, &layout.Diagnostics, masters[masterID].Children, identityAffine, 0, input, m, pageNumber); err != nil {
				break
			}
		}
		fragment := frame
		fragment.ID = fmt.Sprintf("%s-derived-%d", frame.ID, pageCount+1)
		done := fill(&fragment, m)
		page.Boxes = append(page.Boxes, fragment)
		layout.Pages = append(layout.Pages, page)
		if done {
			break
		}
	}
}

func continuationFrame(layout *Layout, storyID string) (int, Box, bool) {
	for pi := len(layout.Pages) - 1; pi >= 0; pi-- {
		for bi := len(layout.Pages[pi].Boxes) - 1; bi >= 0; bi-- {
			box := layout.Pages[pi].Boxes[bi]
			if box.StoryID == storyID && box.Continuation == "auto-pages" {
				return pi, box, true
			}
		}
	}
	return 0, Box{}, false
}

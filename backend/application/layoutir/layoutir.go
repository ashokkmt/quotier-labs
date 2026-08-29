// Package layoutir resolves the V5 scene graph into renderer-neutral physical boxes.
package layoutir

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
)

const DUPerMM = 7200.0 / 25.4

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
	ID, Kind, Text      string
	StoryID             string
	Continuation        string
	Table               *TableFragment
	Image               *Image
	X, Y, Width, Height float64
	Rotation            int32
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

func Resolve(doc *documentmodel.Document) (*Layout, error) {
	return ResolveWithInput(context.Background(), doc, ResolveInput{})
}

// ResolveWithInput resolves a V5 document into a deterministic, physical-unit scene. It checks
// cancellation between nodes and never treats document content as executable code or markup.
func ResolveWithInput(ctx context.Context, doc *documentmodel.Document, input ResolveInput) (*Layout, error) {
	if err := documentmodel.Validate(doc); err != nil {
		return nil, err
	}
	result := &Layout{Pages: make([]Page, 0, len(doc.Root.Pages))}
	masters := make(map[string]documentmodel.Master, len(doc.Root.Masters))
	for _, master := range doc.Root.Masters {
		masters[master.ID] = master
	}
	for _, source := range doc.Root.Pages {
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
			if err := addNodes(ctx, &page, &result.Diagnostics, masters[masterID].Children, 0, 0, input); err != nil {
				return nil, err
			}
		}
		if err := addNodes(ctx, &page, &result.Diagnostics, source.Children, 0, 0, input); err != nil {
			return nil, err
		}
		result.Pages = append(result.Pages, page)
	}
	resolveStories(result, doc.Stories)
	return result, nil
}

func addNodes(ctx context.Context, page *Page, diagnostics *[]Diagnostic, nodes []documentmodel.Node, parentX, parentY int64, input ResolveInput) error {
	for _, node := range nodes {
		if err := ctx.Err(); err != nil {
			return err
		}
		if node.Visibility == "hidden" {
			continue
		}
		x, y := parentX+node.Geometry.X, parentY+node.Geometry.Y
		if node.Role == "group" {
			if err := addNodes(ctx, page, diagnostics, node.Children, x, y, input); err != nil {
				return err
			}
			continue
		}
		text, err := resolveNodeText(node, input)
		if err != nil {
			return fmt.Errorf("node %s props: %w", node.ID, err)
		}
		box := Box{ID: node.ID, Kind: node.Kind, Text: text, StoryID: node.StoryID, Continuation: node.Continuation, X: float64(x) / DUPerMM, Y: float64(y) / DUPerMM, Width: float64(node.Geometry.Width) / DUPerMM, Height: float64(node.Geometry.Height) / DUPerMM, Rotation: node.Geometry.Rotation}
		if node.Kind == "image" {
			image, err := resolveImage(node.Props)
			if err != nil {
				return fmt.Errorf("node %s image: %w", node.ID, err)
			}
			box.Image = image
		}
		if node.Role != "flow-frame" && text != "" && textCapacity(box) < utf8.RuneCountInString(text) {
			*diagnostics = append(*diagnostics, Diagnostic{Code: "overset_text", NodeID: node.ID, Message: "fixed text exceeds its authored box"})
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

func resolveNodeText(node documentmodel.Node, input ResolveInput) (string, error) {
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

func textCapacity(box Box) int {
	// Stable metric: 10pt text, a 0.55em average glyph width and 1.2 line height. The fpdf
	// adapter uses the same 10pt default, keeping diagnostics and output deterministic.
	charsPerLine := int(box.Width / (10 * 25.4 / 72 * .55))
	lines := int(box.Height / (10 * 25.4 / 72 * 1.2))
	if charsPerLine < 1 {
		charsPerLine = 1
	}
	if lines < 1 {
		lines = 1
	}
	return charsPerLine * lines
}

func resolveStories(layout *Layout, stories []documentmodel.Story) {
	content := map[string]string{}
	tables := map[string]tableStory{}
	for _, story := range stories {
		var value struct {
			Text string `json:"text"`
		}
		if json.Unmarshal(story.Content, &value) == nil {
			content[story.ID] = value.Text
		}
		if story.Kind == "table" {
			var table tableStory
			if json.Unmarshal(story.Content, &table) == nil {
				tables[story.ID] = table
			}
		}
	}
	remaining := make(map[string]string, len(content))
	for id, text := range content {
		remaining[id] = text
	}
	for pi := range layout.Pages {
		for bi := range layout.Pages[pi].Boxes {
			box := &layout.Pages[pi].Boxes[bi]
			if box.StoryID == "" {
				continue
			}
			text := remaining[box.StoryID]
			if text == "" {
				continue
			}
			limit := textCapacity(*box)
			if utf8.RuneCountInString(text) <= limit {
				box.Text = text
				remaining[box.StoryID] = ""
				continue
			}
			runes := []rune(text)
			cut := limit
			for cut > 0 && cut < len(runes) && runes[cut] != ' ' && runes[cut] != '\n' {
				cut--
			}
			if cut == 0 {
				cut = limit
			}
			box.Text = strings.TrimSpace(string(runes[:cut]))
			remaining[box.StoryID] = strings.TrimSpace(string(runes[cut:]))
		}
	}
	for storyID, text := range remaining {
		for pageCount := 0; text != "" && pageCount < 100; pageCount++ {
			pageIndex, frame, ok := continuationFrame(layout, storyID)
			if !ok {
				break
			}
			page := Page{Width: layout.Pages[pageIndex].Width, Height: layout.Pages[pageIndex].Height}
			fragment := frame
			fragment.ID = fmt.Sprintf("%s-derived-%d", frame.ID, pageCount+1)
			limit := textCapacity(fragment)
			runes := []rune(text)
			if len(runes) <= limit {
				fragment.Text, text = text, ""
			} else {
				cut := limit
				for cut > 0 && runes[cut] != ' ' && runes[cut] != '\n' {
					cut--
				}
				if cut == 0 {
					cut = limit
				}
				fragment.Text, text = strings.TrimSpace(string(runes[:cut])), strings.TrimSpace(string(runes[cut:]))
			}
			page.Boxes = []Box{fragment}
			layout.Pages = append(layout.Pages, page)
		}
		remaining[storyID] = text
		if text != "" {
			layout.Diagnostics = append(layout.Diagnostics, Diagnostic{Code: "overset_story", NodeID: storyID, Message: "story content does not fit its available flow frames"})
		}
	}
	resolveTables(layout, tables)
}

type tableStory struct {
	Headers []string   `json:"headers"`
	Rows    [][]string `json:"rows"`
}

func resolveTables(layout *Layout, tables map[string]tableStory) {
	for storyID, table := range tables {
		row := 0
		for pi := range layout.Pages {
			for bi := range layout.Pages[pi].Boxes {
				box := &layout.Pages[pi].Boxes[bi]
				if box.StoryID != storyID {
					continue
				}
				capacity := int(box.Height / 5)
				if capacity < 1 {
					capacity = 1
				}
				end := row + capacity
				if end > len(table.Rows) {
					end = len(table.Rows)
				}
				box.Table = &TableFragment{Headers: table.Headers, Rows: table.Rows[row:end], RepeatedHeader: row > 0}
				row = end
			}
		}
		if row < len(table.Rows) {
			layout.Diagnostics = append(layout.Diagnostics, Diagnostic{Code: "overset_table", NodeID: storyID, Message: "table rows do not fit their available flow frames"})
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

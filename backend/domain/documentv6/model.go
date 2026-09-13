// Package documentv6 owns the strict, renderer-independent V6 flow-document contract.
package documentv6

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"path/filepath"
	"slices"
	"strings"
)

const (
	SchemaVersion = 6
	DUPerPoint    = 100
	A4WidthDU     = 59528
	A4HeightDU    = 84189
	MaxNodes      = 2500
	MaxDepth      = 10
	MaxTextRunes  = 1_000_000
	MaxRows       = 500
	MaxColumns    = 20
	MaxImages     = 100
)

var (
	ErrSchemaVersion = errors.New("unsupported document schema version")
	ErrInvalid       = errors.New("invalid V6 document")
)

type Document struct {
	SchemaVersion        int               `json:"schema_version"`
	Settings             Settings          `json:"settings"`
	Styles               []StyleDefinition `json:"styles,omitempty"`
	Body                 Node              `json:"body"`
	HeaderStory          *Node             `json:"header_story,omitempty"`
	FooterStory          *Node             `json:"footer_story,omitempty"`
	FirstPageHeaderStory *Node             `json:"first_page_header_story,omitempty"`
	FirstPageFooterStory *Node             `json:"first_page_footer_story,omitempty"`
	Assets               []Asset           `json:"assets,omitempty"`
}

type Settings struct {
	PageSize           string `json:"page_size"`
	Orientation        string `json:"orientation"`
	Margins            Insets `json:"margins"`
	DifferentFirstPage bool   `json:"different_first_page,omitempty"`
}

type Insets struct {
	Top    int64 `json:"top"`
	Right  int64 `json:"right"`
	Bottom int64 `json:"bottom"`
	Left   int64 `json:"left"`
}

type Asset struct {
	Source      string `json:"source"`
	PixelWidth  int    `json:"pixel_width"`
	PixelHeight int    `json:"pixel_height"`
}

// Node deliberately mirrors the small ProseMirror JSON subset used by the V6 editor.
type Node struct {
	Type    string          `json:"type"`
	Attrs   json.RawMessage `json:"attrs,omitempty"`
	Content []Node          `json:"content,omitempty"`
	Text    string          `json:"text,omitempty"`
	Marks   []Mark          `json:"marks,omitempty"`
}

type Mark struct {
	Type  string          `json:"type"`
	Attrs json.RawMessage `json:"attrs,omitempty"`
}

type ParagraphAttrs struct {
	ID              string  `json:"id"`
	Style           string  `json:"style,omitempty"`
	Alignment       string  `json:"alignment,omitempty"`
	SpacingBefore   int64   `json:"spacing_before,omitempty"`
	SpacingAfter    int64   `json:"spacing_after,omitempty"`
	LineHeight      float64 `json:"line_height,omitempty"`
	LeftIndent      int64   `json:"left_indent,omitempty"`
	FirstLineIndent int64   `json:"first_line_indent,omitempty"`
	HangingIndent   int64   `json:"hanging_indent,omitempty"`
	RightIndent     int64   `json:"right_indent,omitempty"`
	KeepWithNext    bool    `json:"keep_with_next,omitempty"`
	KeepTogether    bool    `json:"keep_together,omitempty"`
	WidowOrphans    int     `json:"widow_orphans,omitempty"`
}

type TableAttrs struct {
	ID           string  `json:"id"`
	ColumnWidths []int64 `json:"column_widths"`
	Width        int64   `json:"width,omitempty"`
	Alignment    string  `json:"alignment,omitempty"`
	BorderPreset string  `json:"border_preset,omitempty"`
	BorderColor  string  `json:"border_color,omitempty"`
	CellPadding  int64   `json:"cell_padding,omitempty"`
	HeaderRows   int     `json:"header_rows,omitempty"`
	KeepTogether bool    `json:"keep_together,omitempty"`
}

type TableRowAttrs struct {
	MinHeight    int64 `json:"min_height,omitempty"`
	KeepTogether bool  `json:"keep_together,omitempty"`
}

type TableCellAttrs struct {
	Colspan           int     `json:"colspan,omitempty"`
	Rowspan           int     `json:"rowspan,omitempty"`
	Colwidth          []int64 `json:"colwidth,omitempty"`
	Background        string  `json:"background,omitempty"`
	Alignment         string  `json:"alignment,omitempty"`
	VerticalAlignment string  `json:"vertical_alignment,omitempty"`
	Padding           int64   `json:"padding,omitempty"`
}

type ImageAttrs struct {
	ID          string `json:"id"`
	Source      string `json:"source"`
	Width       int64  `json:"width"`
	Height      int64  `json:"height"`
	PixelWidth  int    `json:"pixel_width"`
	PixelHeight int    `json:"pixel_height"`
	Alignment   string `json:"alignment,omitempty"`
	Alt         string `json:"alt,omitempty"`
	AspectLock  bool   `json:"aspect_lock,omitempty"`
	SpaceBefore int64  `json:"space_before,omitempty"`
	SpaceAfter  int64  `json:"space_after,omitempty"`
	Positioning string `json:"positioning,omitempty"`
	OffsetX     int64  `json:"offset_x,omitempty"`
	OffsetY     int64  `json:"offset_y,omitempty"`
	Layer       string `json:"layer,omitempty"`
}

type IDAttrs struct {
	ID string `json:"id"`
}

type LineItemTableAttrs struct {
	ID               string           `json:"id"`
	Rows             []LineItem       `json:"rows"`
	Columns          []LineItemColumn `json:"columns,omitempty"`
	Width            int64            `json:"width,omitempty"`
	Alignment        string           `json:"alignment,omitempty"`
	HeaderBackground string           `json:"header_background,omitempty"`
	ShowSubtotal     bool             `json:"show_subtotal,omitempty"`
	ShowDiscount     bool             `json:"show_discount,omitempty"`
	ShowTax          bool             `json:"show_tax,omitempty"`
	ShowGrandTotal   bool             `json:"show_grand_total,omitempty"`
}

type LineItemColumn struct {
	Key   string `json:"key"`
	Label string `json:"label,omitempty"`
	Width int64  `json:"width,omitempty"`
}

type LineItem struct {
	ID           string  `json:"id"`
	Description  string  `json:"description"`
	Quantity     float64 `json:"quantity"`
	Rate         int64   `json:"rate"`
	Discount     int64   `json:"discount"`
	TaxRate      float64 `json:"tax_rate"`
	TaxInclusive bool    `json:"tax_inclusive"`
}

type TextStyleAttrs struct {
	FontFamily string `json:"fontFamily,omitempty"`
	FontSize   int64  `json:"fontSize,omitempty"`
	Color      string `json:"color,omitempty"`
}

type ColorAttrs struct {
	Color string `json:"color"`
}

type LinkAttrs struct {
	Href string `json:"href"`
}

type ListAttrs struct {
	ID    string `json:"id"`
	Start int    `json:"start,omitempty"`
}

type FieldAttrs struct {
	ID            string `json:"id"`
	Key           string `json:"key"`
	Fallback      string `json:"fallback,omitempty"`
	EmptyBehavior string `json:"empty_behavior,omitempty"`
}

var AllowedLineItemColumns = []string{"description", "quantity", "rate", "discount", "tax_rate", "taxable", "tax", "amount"}

var AllowedFieldKeys = []string{
	"company.name", "company.legal_name", "company.address", "company.phone", "company.email", "company.website", "company.gstin", "company.pan",
	"customer.name", "customer.company_name", "customer.contact_person", "customer.address", "customer.billing_address", "customer.shipping_address", "customer.phone", "customer.email", "customer.gstin", "customer.pan", "customer.state", "customer.country",
	"quotation.number", "quotation.date", "quotation.valid_until", "quotation.subtotal", "quotation.discount_total", "quotation.taxable_total", "quotation.cgst_total", "quotation.sgst_total", "quotation.igst_total", "quotation.grand_total",
}

func DefaultLineItemColumns() []LineItemColumn {
	return []LineItemColumn{{Key: "description", Label: "Description"}, {Key: "quantity", Label: "Qty"}, {Key: "rate", Label: "Rate"}, {Key: "tax_rate", Label: "Tax"}, {Key: "amount", Label: "Amount"}}
}

func NewBlank(firstParagraphID string) *Document {
	return &Document{
		SchemaVersion: SchemaVersion,
		Settings: Settings{
			PageSize: "A4", Orientation: "portrait",
			Margins: Insets{Top: 7200, Right: 7200, Bottom: 7200, Left: 7200},
		},
		Styles: StarterStyles(),
		Body:   Node{Type: "doc", Content: []Node{{Type: "paragraph", Attrs: mustJSON(ParagraphAttrs{ID: firstParagraphID}), Content: []Node{}}}},
		Assets: []Asset{},
	}
}

// NewStarterQuotation is the built-in V6 quotation template. It deliberately contains no image:
// managed assets are company-scoped and a global template must never carry a filesystem reference.
func NewStarterQuotation() *Document {
	doc := NewBlank("starter-title")
	paragraph := func(id, style string, content ...Node) Node {
		return Node{Type: "paragraph", Attrs: mustJSON(ParagraphAttrs{ID: id, Style: style}), Content: content}
	}
	field := func(id, key, fallback string) Node {
		behavior := "diagnostic"
		if fallback != "" {
			behavior = "fallback"
		}
		return Node{Type: "field", Attrs: mustJSON(FieldAttrs{ID: id, Key: key, Fallback: fallback, EmptyBehavior: behavior})}
	}
	cell := func(kind, id string, content ...Node) Node {
		return Node{Type: kind, Attrs: mustJSON(TableCellAttrs{Colspan: 1, Rowspan: 1, Padding: 425}), Content: []Node{paragraph(id, "Body", content...)}}
	}
	doc.Body.Content = []Node{
		paragraph("starter-title", "Title", Node{Type: "text", Text: "QUOTATION"}),
		paragraph("starter-number", "Body", Node{Type: "text", Text: "Quotation: "}, field("field-number", "quotation.number", "Draft"), Node{Type: "text", Text: "    Date: "}, field("field-date", "quotation.date", "")),
		{Type: "table", Attrs: mustJSON(TableAttrs{ID: "starter-parties", ColumnWidths: []int64{22564, 22564}, Width: 45128, BorderPreset: "all", BorderColor: "#d1d5db", CellPadding: 425, HeaderRows: 1}), Content: []Node{
			{Type: "tableRow", Content: []Node{cell("tableHeader", "starter-from", Node{Type: "text", Text: "From"}), cell("tableHeader", "starter-to", Node{Type: "text", Text: "Prepared for"})}},
			{Type: "tableRow", Content: []Node{cell("tableCell", "starter-company", field("field-company", "company.name", "Company")), cell("tableCell", "starter-customer", field("field-customer", "customer.name", "Select a customer"))}},
		}},
		{Type: "lineItemTable", Attrs: mustJSON(LineItemTableAttrs{ID: "starter-items", Rows: []LineItem{{ID: "starter-item", Description: "Service", Quantity: 1, TaxRate: 18}}, Columns: DefaultLineItemColumns(), HeaderBackground: "#e5e7eb", ShowSubtotal: true, ShowDiscount: true, ShowTax: true, ShowGrandTotal: true})},
		paragraph("starter-terms-heading", "Heading 2", Node{Type: "text", Text: "Terms"}),
		paragraph("starter-terms", "Terms", Node{Type: "text", Text: "Thank you for your business."}),
	}
	return doc
}

func Parse(data []byte) (*Document, error) {
	if len(data) == 0 || len(data) > 8<<20 {
		return nil, fmt.Errorf("%w: document size is out of bounds", ErrInvalid)
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var d Document
	if err := dec.Decode(&d); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if dec.Decode(&struct{}{}) != io.EOF {
		return nil, fmt.Errorf("%w: trailing document data", ErrInvalid)
	}
	if d.SchemaVersion != SchemaVersion {
		return nil, fmt.Errorf("%w: %d", ErrSchemaVersion, d.SchemaVersion)
	}
	if err := Validate(&d); err != nil {
		return nil, err
	}
	return &d, nil
}

func Validate(d *Document) error {
	if d == nil || d.SchemaVersion != SchemaVersion {
		return ErrSchemaVersion
	}
	if d.Settings.PageSize != "A4" || !oneOf(d.Settings.Orientation, "portrait", "landscape") {
		return invalid("settings must be A4 portrait or landscape")
	}
	pageW, pageH := int64(A4WidthDU), int64(A4HeightDU)
	if d.Settings.Orientation == "landscape" {
		pageW, pageH = pageH, pageW
	}
	m := d.Settings.Margins
	if m.Top < 0 || m.Right < 0 || m.Bottom < 0 || m.Left < 0 || m.Left+m.Right > pageW-7200 || m.Top+m.Bottom > pageH-7200 {
		return invalid("page margins leave no printable area")
	}
	if d.Body.Type != "doc" || len(d.Body.Attrs) != 0 || d.Body.Text != "" || len(d.Body.Marks) != 0 {
		return invalid("body must be a ProseMirror doc node")
	}
	state := validationState{ids: map[string]bool{}, assets: map[string]Asset{}}
	if err := validateStyles(d.Styles); err != nil {
		return err
	}
	for _, asset := range d.Assets {
		if err := validateAsset(asset); err != nil {
			return err
		}
		if _, exists := state.assets[asset.Source]; exists {
			return invalid("duplicate asset reference")
		}
		state.assets[asset.Source] = asset
	}
	if len(d.Assets) > MaxImages {
		return invalid("image limit exceeded")
	}
	for _, child := range d.Body.Content {
		if err := validateNode(child, 1, &state, "doc", 0); err != nil {
			return err
		}
	}
	if len(d.Body.Content) == 0 {
		return invalid("body must contain at least one block")
	}
	for name, story := range map[string]*Node{
		"header_story": d.HeaderStory, "footer_story": d.FooterStory,
		"first_page_header_story": d.FirstPageHeaderStory, "first_page_footer_story": d.FirstPageFooterStory,
	} {
		if story == nil {
			continue
		}
		if story.Type != "doc" || len(story.Attrs) != 0 || story.Text != "" || len(story.Marks) != 0 {
			return invalid(name + " must be a ProseMirror doc node")
		}
		for _, child := range story.Content {
			if err := validateNode(child, 1, &state, "story", 0); err != nil {
				return err
			}
		}
	}
	return nil
}

type validationState struct {
	nodes, text, images int
	ids                 map[string]bool
	assets              map[string]Asset
}

func validateNode(n Node, depth int, state *validationState, parent string, listDepth int) error {
	state.nodes++
	if state.nodes > MaxNodes || depth > MaxDepth {
		return invalid("node or nesting limit exceeded")
	}
	if n.Type == "text" {
		if parent != "paragraph" || n.Text == "" || len(n.Content) != 0 || len(n.Attrs) != 0 {
			return invalid("text nodes require text only")
		}
		state.text += len([]rune(n.Text))
		if state.text > MaxTextRunes {
			return invalid("text limit exceeded")
		}
		for _, mark := range n.Marks {
			if err := validateMark(mark); err != nil {
				return err
			}
		}
		return nil
	}
	if n.Text != "" || len(n.Marks) != 0 {
		return invalid("non-text node contains text or marks")
	}
	switch n.Type {
	case "paragraph":
		if !oneOf(parent, "doc", "story", "tableCell", "listItem") {
			return invalid("paragraph has invalid parent")
		}
		attrs, err := decodeAttrs[ParagraphAttrs](n.Attrs)
		if err != nil || attrs.ID == "" || (attrs.Style != "" && !ValidStyleName(attrs.Style)) || !oneOf(defaultString(attrs.Alignment, "left"), "left", "center", "right", "justify") || attrs.SpacingBefore < 0 || attrs.SpacingAfter < 0 || attrs.SpacingBefore > 7200 || attrs.SpacingAfter > 7200 || attrs.LineHeight < 0 || attrs.LineHeight > 3 || attrs.LeftIndent < 0 || attrs.RightIndent < 0 || attrs.FirstLineIndent < 0 || attrs.FirstLineIndent > 14400 || attrs.HangingIndent < 0 || attrs.HangingIndent > 14400 || attrs.HangingIndent > attrs.LeftIndent || (attrs.FirstLineIndent > 0 && attrs.HangingIndent > 0) || attrs.WidowOrphans < 0 || attrs.WidowOrphans > 5 {
			return invalid("invalid paragraph attributes")
		}
		if err := state.addID(attrs.ID); err != nil {
			return err
		}
		for _, child := range n.Content {
			if !oneOf(child.Type, "text", "hardBreak", "pageNumber", "pageCount", "field") {
				return invalid("paragraph contains an unsupported inline node")
			}
			if err := validateNode(child, depth+1, state, "paragraph", listDepth); err != nil {
				return err
			}
		}
	case "table":
		if parent != "doc" {
			return invalid("table has invalid parent")
		}
		attrs, err := decodeAttrs[TableAttrs](n.Attrs)
		if err != nil || attrs.ID == "" || len(attrs.ColumnWidths) == 0 || len(attrs.ColumnWidths) > MaxColumns || attrs.Width < 0 || attrs.Width > A4HeightDU || !oneOf(defaultString(attrs.Alignment, "left"), "left", "center", "right") || !oneOf(defaultString(attrs.BorderPreset, "all"), "all", "outer", "none") || !validColor(defaultString(attrs.BorderColor, "#d1d5db"), false) || attrs.CellPadding < 0 || attrs.CellPadding > 3600 || attrs.HeaderRows < 0 || attrs.HeaderRows > len(n.Content) {
			return invalid("invalid table attributes")
		}
		var widthTotal int64
		for _, width := range attrs.ColumnWidths {
			if width < 1200 || width > A4HeightDU {
				return invalid("invalid table column width")
			}
			widthTotal += width
		}
		if attrs.Width > 0 && widthTotal != attrs.Width {
			return invalid("table width must equal its column widths")
		}
		if err := state.addID(attrs.ID); err != nil {
			return err
		}
		if len(n.Content) == 0 || len(n.Content) > MaxRows {
			return invalid("table row limit exceeded")
		}
		grid := make([][]bool, len(n.Content))
		for rowIndex := range grid {
			grid[rowIndex] = make([]bool, len(attrs.ColumnWidths))
		}
		for rowIndex, row := range n.Content {
			rowAttrs := TableRowAttrs{}
			var rowErr error
			if len(row.Attrs) != 0 && !bytes.Equal(row.Attrs, []byte("null")) {
				rowAttrs, rowErr = decodeAttrs[TableRowAttrs](row.Attrs)
			}
			if row.Type != "tableRow" || rowErr != nil || rowAttrs.MinHeight < 0 || rowAttrs.MinHeight > A4HeightDU || len(row.Content) == 0 {
				return invalid("invalid table row")
			}
			column := 0
			for _, cell := range row.Content {
				for column < len(grid[rowIndex]) && grid[rowIndex][column] {
					column++
				}
				if column == len(grid[rowIndex]) {
					return invalid("table spans exceed the rectangular grid")
				}
				cellAttrs, cellErr := decodeAttrs[TableCellAttrs](cell.Attrs)
				colspan, rowspan := defaultInt(cellAttrs.Colspan, 1), defaultInt(cellAttrs.Rowspan, 1)
				if cellErr != nil || column+colspan > len(attrs.ColumnWidths) || rowIndex+rowspan > len(n.Content) {
					return invalid("table spans must form a rectangular grid")
				}
				for y := rowIndex; y < rowIndex+rowspan; y++ {
					for x := column; x < column+colspan; x++ {
						if grid[y][x] {
							return invalid("table spans overlap")
						}
						grid[y][x] = true
					}
				}
				if rowIndex < attrs.HeaderRows && cell.Type != "tableHeader" || rowIndex >= attrs.HeaderRows && cell.Type == "tableHeader" {
					return invalid("table header cells must match header rows")
				}
				if rowIndex < attrs.HeaderRows && rowIndex+rowspan > attrs.HeaderRows {
					return invalid("table header spans into body rows")
				}
				if err := validateNode(cell, depth+1, state, "tableRow", listDepth); err != nil {
					return err
				}
				column += colspan
			}
			for _, occupied := range grid[rowIndex] {
				if !occupied {
					return invalid("table spans must form a rectangular grid")
				}
			}
		}
	case "tableCell", "tableHeader":
		if parent != "tableRow" {
			return invalid("table cell has invalid parent")
		}
		attrs, err := decodeAttrs[TableCellAttrs](n.Attrs)
		if err != nil || defaultInt(attrs.Colspan, 1) < 1 || defaultInt(attrs.Colspan, 1) > MaxColumns || defaultInt(attrs.Rowspan, 1) < 1 || defaultInt(attrs.Rowspan, 1) > MaxRows || (len(attrs.Colwidth) != 0 && len(attrs.Colwidth) != defaultInt(attrs.Colspan, 1)) || !oneOf(defaultString(attrs.Alignment, "left"), "left", "center", "right") || !oneOf(defaultString(attrs.VerticalAlignment, "top"), "top", "middle", "bottom") || attrs.Padding < 0 || attrs.Padding > 3600 || !validColor(defaultString(attrs.Background, "transparent"), true) {
			return invalid("invalid table cell attributes")
		}
		if len(n.Content) == 0 {
			return invalid("table cells require a paragraph")
		}
		for _, child := range n.Content {
			if !oneOf(child.Type, "paragraph", "bulletList", "orderedList") {
				return invalid("table cells contain unsupported block content")
			}
			if err := validateNode(child, depth+1, state, "tableCell", listDepth); err != nil {
				return err
			}
		}
	case "imageBlock":
		if parent != "doc" {
			return invalid("image has invalid parent")
		}
		attrs, err := decodeAttrs[ImageAttrs](n.Attrs)
		if err != nil || attrs.ID == "" || attrs.Width < 100 || attrs.Height < 100 || attrs.Width > A4HeightDU || attrs.Height > A4HeightDU || attrs.PixelWidth <= 0 || attrs.PixelHeight <= 0 || len([]rune(attrs.Alt)) > 300 || attrs.SpaceBefore < 0 || attrs.SpaceAfter < 0 || attrs.SpaceBefore > 7200 || attrs.SpaceAfter > 7200 || !oneOf(defaultString(attrs.Alignment, "left"), "left", "center", "right") || !oneOf(defaultString(attrs.Positioning, "inline"), "inline", "floating") || !oneOf(defaultString(attrs.Layer, "front"), "front", "behind") || attrs.OffsetX < -A4WidthDU || attrs.OffsetX > A4WidthDU || attrs.OffsetY < -A4HeightDU || attrs.OffsetY > A4HeightDU || len(n.Content) != 0 {
			return invalid("invalid image attributes")
		}
		if err := state.addID(attrs.ID); err != nil {
			return err
		}
		asset, ok := state.assets[attrs.Source]
		if !ok {
			return invalid("image references an undeclared managed asset")
		}
		if asset.PixelWidth != attrs.PixelWidth || asset.PixelHeight != attrs.PixelHeight {
			return invalid("image intrinsic dimensions do not match its managed asset")
		}
		if attrs.AspectLock {
			expected, actual := attrs.Width*int64(attrs.PixelHeight), attrs.Height*int64(attrs.PixelWidth)
			if abs64(expected-actual)*100 > expected {
				return invalid("aspect-locked image dimensions changed ratio")
			}
		}
		state.images++
		if state.images > MaxImages {
			return invalid("image limit exceeded")
		}
	case "pageBreak":
		if parent != "doc" {
			return invalid("page break has invalid parent")
		}
		attrs, err := decodeAttrs[IDAttrs](n.Attrs)
		if err != nil || attrs.ID == "" || len(n.Content) != 0 {
			return invalid("invalid page break")
		}
		return state.addID(attrs.ID)
	case "lineItemTable":
		if parent != "doc" {
			return invalid("line item table has invalid parent")
		}
		attrs, err := decodeAttrs[LineItemTableAttrs](n.Attrs)
		if err != nil || attrs.ID == "" || len(attrs.Rows) > MaxRows || len(attrs.Columns) > MaxColumns || attrs.Width < 0 || attrs.Width > A4HeightDU || !oneOf(defaultString(attrs.Alignment, "left"), "left", "center", "right") || !validColor(defaultString(attrs.HeaderBackground, "#e5e7eb"), false) || len(n.Content) != 0 {
			return invalid("invalid line item table")
		}
		if err := state.addID(attrs.ID); err != nil {
			return err
		}
		columns := attrs.Columns
		if len(columns) == 0 {
			columns = DefaultLineItemColumns()
		}
		seenColumns := map[string]bool{}
		for _, column := range columns {
			if !oneOf(column.Key, AllowedLineItemColumns...) || seenColumns[column.Key] || len([]rune(column.Label)) > 80 || column.Width < 0 || column.Width > A4HeightDU {
				return invalid("invalid line item column")
			}
			seenColumns[column.Key] = true
		}
		seenRows := map[string]bool{}
		for _, row := range attrs.Rows {
			if strings.TrimSpace(row.ID) == "" || len([]rune(row.Description)) > 500 || row.Quantity < 0 || row.Quantity > 1_000_000 || row.Rate < 0 || row.Discount < 0 || row.Discount > 100_000_000_00 || row.TaxRate < 0 || row.TaxRate > 100 {
				return invalid("invalid line item")
			}
			if seenRows[row.ID] {
				return invalid("duplicate line item id")
			}
			seenRows[row.ID] = true
		}
	case "bulletList", "orderedList":
		if !oneOf(parent, "doc", "story", "tableCell", "listItem") || listDepth >= 3 {
			return invalid("list nesting limit exceeded")
		}
		attrs, err := decodeAttrs[ListAttrs](n.Attrs)
		if err != nil || attrs.ID == "" || (n.Type == "orderedList" && (attrs.Start < 0 || attrs.Start > 100000)) || len(n.Content) == 0 {
			return invalid("invalid list")
		}
		if err := state.addID(attrs.ID); err != nil {
			return err
		}
		for _, child := range n.Content {
			if child.Type != "listItem" {
				return invalid("lists may contain list items only")
			}
			if err := validateNode(child, depth+1, state, n.Type, listDepth+1); err != nil {
				return err
			}
		}
	case "listItem":
		if !oneOf(parent, "bulletList", "orderedList") {
			return invalid("list item has invalid parent")
		}
		attrs, err := decodeAttrs[IDAttrs](n.Attrs)
		if err != nil || attrs.ID == "" || len(n.Content) == 0 || n.Content[0].Type != "paragraph" {
			return invalid("invalid list item")
		}
		if err := state.addID(attrs.ID); err != nil {
			return err
		}
		for _, child := range n.Content {
			if !oneOf(child.Type, "paragraph", "bulletList", "orderedList") {
				return invalid("list item contains unsupported content")
			}
			if err := validateNode(child, depth+1, state, "listItem", listDepth); err != nil {
				return err
			}
		}
	case "hardBreak", "pageNumber", "pageCount":
		if parent != "paragraph" || len(n.Attrs) != 0 || len(n.Content) != 0 {
			return invalid("invalid inline node")
		}
	case "field":
		attrs, err := decodeAttrs[FieldAttrs](n.Attrs)
		if parent != "paragraph" || err != nil || attrs.ID == "" || !oneOf(attrs.Key, AllowedFieldKeys...) || len([]rune(attrs.Fallback)) > 300 || !oneOf(defaultString(attrs.EmptyBehavior, "diagnostic"), "blank", "fallback", "diagnostic") || len(n.Content) != 0 {
			return invalid("invalid business field")
		}
		return state.addID(attrs.ID)
	case "horizontalRule":
		if !oneOf(parent, "doc", "story") {
			return invalid("horizontal rule has invalid parent")
		}
		attrs, err := decodeAttrs[IDAttrs](n.Attrs)
		if err != nil || attrs.ID == "" || len(n.Content) != 0 {
			return invalid("invalid horizontal rule")
		}
		return state.addID(attrs.ID)
	default:
		return invalid("unknown node type " + n.Type)
	}
	return nil
}

func validateMark(mark Mark) error {
	switch mark.Type {
	case "bold", "italic", "underline", "strike":
		if len(mark.Attrs) != 0 {
			return invalid("formatting mark must not have attributes")
		}
	case "textStyle":
		attrs, err := decodeAttrs[TextStyleAttrs](mark.Attrs)
		if err != nil || (attrs.FontFamily != "" && !oneOf(attrs.FontFamily, "Quotier Sans", "Quotier Serif", "Quotier Mono")) || (attrs.FontSize != 0 && (attrs.FontSize < 600 || attrs.FontSize > 7200)) || (attrs.Color != "" && !validColor(attrs.Color, false)) {
			return invalid("invalid text style")
		}
	case "highlight":
		attrs, err := decodeAttrs[ColorAttrs](mark.Attrs)
		if err != nil || !validColor(attrs.Color, false) {
			return invalid("invalid highlight")
		}
	case "link":
		attrs, err := decodeAttrs[LinkAttrs](mark.Attrs)
		if err != nil || !validLink(attrs.Href) {
			return invalid("invalid link")
		}
	default:
		return invalid("unknown mark type " + mark.Type)
	}
	return nil
}

func validLink(href string) bool {
	trimmed := strings.TrimSpace(href)
	if trimmed == "" || len(trimmed) > 2048 || strings.ContainsAny(trimmed, "\r\n") {
		return false
	}
	parsed, err := url.ParseRequestURI(trimmed)
	if err != nil {
		return false
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https":
		return parsed.Host != ""
	case "mailto":
		return parsed.Opaque != ""
	default:
		return false
	}
}

func validateAsset(asset Asset) error {
	if !strings.HasPrefix(asset.Source, "asset:") || asset.PixelWidth <= 0 || asset.PixelHeight <= 0 || asset.PixelWidth > 12000 || asset.PixelHeight > 12000 || int64(asset.PixelWidth)*int64(asset.PixelHeight) > 50_000_000 {
		return invalid("invalid managed asset")
	}
	name := strings.TrimPrefix(asset.Source, "asset:")
	if name == "" || filepath.Base(name) != name || !oneOf(strings.ToLower(filepath.Ext(name)), ".png", ".jpg", ".jpeg", ".webp") {
		return invalid("invalid managed asset reference")
	}
	return nil
}

func (s *validationState) addID(id string) error {
	if s.ids[id] {
		return invalid("duplicate node id")
	}
	s.ids[id] = true
	return nil
}

func decodeAttrs[T any](raw json.RawMessage) (T, error) {
	var value T
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
		return value, errors.New("attributes are required")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&value); err != nil {
		return value, err
	}
	if dec.Decode(&struct{}{}) != io.EOF {
		return value, errors.New("trailing attribute data")
	}
	return value, nil
}

func validColor(value string, transparent bool) bool {
	if transparent && value == "transparent" {
		return true
	}
	if len(value) != 7 || value[0] != '#' {
		return false
	}
	for _, c := range value[1:] {
		if !strings.ContainsRune("0123456789abcdefABCDEF", c) {
			return false
		}
	}
	return true
}

func oneOf[T comparable](value T, allowed ...T) bool { return slices.Contains(allowed, value) }
func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
func defaultInt(value, fallback int) int {
	if value == 0 {
		return fallback
	}
	return value
}
func abs64(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}
func invalid(message string) error { return fmt.Errorf("%w: %s", ErrInvalid, message) }
func mustJSON(value any) json.RawMessage {
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return raw
}

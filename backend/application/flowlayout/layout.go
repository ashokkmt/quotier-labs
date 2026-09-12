// Package flowlayout turns a validated V6 flow document into authoritative physical pages.
package flowlayout

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/calculation"
	"quotierlabs/backend/domain/documentv6"
)

const duPerMM = 7200.0 / 25.4

type Diagnostic struct {
	Code    string `json:"code"`
	NodeID  string `json:"nodeId"`
	Message string `json:"message"`
}

type SourceRange struct {
	NodeID string `json:"nodeId"`
	Page   int    `json:"page"`
	Y      int64  `json:"y"`
	Height int64  `json:"height"`
}

type PageMap struct {
	PageWidth   int64         `json:"pageWidth"`
	PageHeight  int64         `json:"pageHeight"`
	PageCount   int           `json:"pageCount"`
	Ranges      []SourceRange `json:"ranges"`
	Diagnostics []Diagnostic  `json:"diagnostics"`
}

type Run struct {
	Text       string
	FontFamily string
	FontSizePt float64
	Bold       bool
	Italic     bool
	Underline  bool
	Strike     bool
	Color      string
	Highlight  string
	Link       string
	Field      string
}

type Line struct{ Runs []Run }

type TableRow struct {
	Cells []TableCell
}

type TableCell struct {
	Lines      []Line
	Text       string
	Background string
	Align      string
}

type Block struct {
	ID        string
	Kind      string
	X, Y      float64
	Width     float64
	Height    float64
	Align     string
	FirstLine float64
	TextTop   float64
	Lines     []Line
	TableRows []TableRow
	Columns   []float64
	Source    string
	Alt       string
}

type Page struct {
	Width, Height float64
	Blocks        []Block
}

type Layout struct {
	Pages       []Page
	Ranges      []SourceRange
	Diagnostics []Diagnostic
}

type ResolveInput struct {
	Company   *domain.Company
	Customer  *domain.Customer
	Quotation *domain.Quotation
}

func Resolve(ctx context.Context, doc *documentv6.Document, input ResolveInput, metrics layoutir.Metrics) (*Layout, error) {
	if err := documentv6.Validate(doc); err != nil {
		return nil, err
	}
	if metrics == nil {
		metrics = layoutir.DefaultMetrics{}
	}
	widthDU, heightDU := int64(documentv6.A4WidthDU), int64(documentv6.A4HeightDU)
	if doc.Settings.Orientation == "landscape" {
		widthDU, heightDU = heightDU, widthDU
	}
	pageWidth, pageHeight := float64(widthDU)/duPerMM, float64(heightDU)/duPerMM
	left, right := float64(doc.Settings.Margins.Left)/duPerMM, float64(doc.Settings.Margins.Right)/duPerMM
	top, bottom := float64(doc.Settings.Margins.Top)/duPerMM, float64(doc.Settings.Margins.Bottom)/duPerMM
	contentWidth := pageWidth - left - right
	result := &Layout{Pages: []Page{{Width: pageWidth, Height: pageHeight}}, Ranges: []SourceRange{}, Diagnostics: []Diagnostic{}}
	pageIndex, y := 0, top

	newPage := func() {
		result.Pages = append(result.Pages, Page{Width: pageWidth, Height: pageHeight})
		pageIndex++
		y = top
	}
	place := func(block Block) {
		if y+block.Height > pageHeight-bottom && len(result.Pages[pageIndex].Blocks) > 0 {
			newPage()
		}
		block.Y = y
		result.Pages[pageIndex].Blocks = append(result.Pages[pageIndex].Blocks, block)
		result.Ranges = append(result.Ranges, SourceRange{NodeID: block.ID, Page: pageIndex + 1, Y: int64(math.Round(y * duPerMM)), Height: int64(math.Round(block.Height * duPerMM))})
		y += block.Height
	}

	for _, node := range flattenBlocks(doc.Body.Content, 0) {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		switch node.Type {
		case "pageBreak":
			attrs := decode[documentv6.IDAttrs](node.Attrs)
			result.Ranges = append(result.Ranges, SourceRange{NodeID: attrs.ID, Page: pageIndex + 1, Y: int64(math.Round(y * duPerMM))})
			newPage()
		case "paragraph":
			attrs := decode[documentv6.ParagraphAttrs](node.Attrs)
			style, styleErr := documentv6.ResolveParagraphStyle(doc, attrs)
			if styleErr != nil {
				return nil, styleErr
			}
			fontRuns := inlineRuns(node.Content, style)
			available := contentWidth - float64(style.LeftIndent+style.RightIndent)/duPerMM
			if available < 10 {
				available = 10
			}
			firstLine := float64(style.FirstLineIndent-style.HangingIndent) / duPerMM
			lines := wrapRuns(fontRuns, math.Max(10, available-firstLine), metrics)
			lineHeight := style.LineHeight
			maxPt := 10.0
			for _, run := range fontRuns {
				if run.FontSizePt > maxPt {
					maxPt = run.FontSizePt
				}
			}
			height := float64(style.SpacingBefore+style.SpacingAfter)/duPerMM + math.Max(1, float64(len(lines)))*metrics.LineHeightMM(maxPt)*lineHeight/1.2
			x := left + float64(style.LeftIndent)/duPerMM
			place(Block{ID: attrs.ID, Kind: "paragraph", X: x, Width: available, Height: height, Align: style.Alignment, FirstLine: firstLine, TextTop: float64(style.SpacingBefore) / duPerMM, Lines: lines})
		case "horizontalRule":
			attrs := decode[documentv6.IDAttrs](node.Attrs)
			place(Block{ID: attrs.ID, Kind: "horizontalRule", X: left, Width: contentWidth, Height: 3})
		case "imageBlock":
			attrs := decode[documentv6.ImageAttrs](node.Attrs)
			w, h := float64(attrs.Width)/duPerMM, float64(attrs.Height)/duPerMM
			x := left
			if attrs.Alignment == "center" {
				x = left + (contentWidth-w)/2
			} else if attrs.Alignment == "right" {
				x = pageWidth - right - w
			}
			place(Block{ID: attrs.ID, Kind: "image", X: x, Width: w, Height: h, Align: attrs.Alignment, Source: attrs.Source, Alt: attrs.Alt})
		case "table":
			attrs := decode[documentv6.TableAttrs](node.Attrs)
			columns := make([]float64, len(attrs.ColumnWidths))
			var sum float64
			for i, w := range attrs.ColumnWidths {
				columns[i] = float64(w) / duPerMM
				sum += columns[i]
			}
			if sum > contentWidth {
				scale := contentWidth / sum
				sum = 0
				for i := range columns {
					columns[i] *= scale
					sum += columns[i]
				}
			}
			x := left
			if attrs.Alignment == "center" {
				x = left + (contentWidth-sum)/2
			} else if attrs.Alignment == "right" {
				x = pageWidth - right - sum
			}
			for rowIndex, rowNode := range node.Content {
				rowAttrs := decode[documentv6.TableRowAttrs](rowNode.Attrs)
				cells := make([]TableCell, len(rowNode.Content))
				rowHeight := math.Max(8, float64(rowAttrs.MinHeight)/duPerMM)
				for i, cell := range rowNode.Content {
					ca := decode[documentv6.TableCellAttrs](cell.Attrs)
					runs := cellRuns(doc, cell)
					lines := wrapRuns(runs, math.Max(1, columns[i]-3), metrics)
					cells[i] = TableCell{Lines: lines, Text: plainText(cell), Background: defaultString(ca.Background, "transparent"), Align: defaultString(ca.Alignment, "left")}
					rowHeight = math.Max(rowHeight, tableLinesHeight(lines, metrics)+2)
				}
				place(Block{ID: fmt.Sprintf("%s-row-%d", attrs.ID, rowIndex), Kind: "tableRow", X: x, Width: sum, Height: rowHeight, Columns: columns, TableRows: []TableRow{{Cells: cells}}})
			}
		case "lineItemTable":
			attrs := decode[documentv6.LineItemTableAttrs](node.Attrs)
			columns := []float64{contentWidth * .46, contentWidth * .12, contentWidth * .18, contentWidth * .12, contentWidth * .12}
			head := textTableRow(doc, "Table Header", []string{"Description", "Qty", "Rate", "Tax", "Amount"}, "#e5e7eb")
			place(Block{ID: attrs.ID + "-header", Kind: "tableRow", X: left, Width: contentWidth, Height: 8, Columns: columns, TableRows: []TableRow{head}})
			items := make([]calculation.LineItemInput, 0, len(attrs.Rows))
			for _, row := range attrs.Rows {
				items = append(items, calculation.LineItemInput{ID: row.ID, QuantityFloat: row.Quantity, Rate: row.Rate, Discount: row.Discount, TaxRateFloat: row.TaxRate, TaxInclusive: row.TaxInclusive})
				amount := int64(math.Round(row.Quantity*float64(row.Rate))) - row.Discount
				cells := []string{row.Description, strconv.FormatFloat(row.Quantity, 'f', -1, 64), money(row.Rate), strconv.FormatFloat(row.TaxRate, 'f', -1, 64) + "%", money(amount)}
				place(Block{ID: attrs.ID + "-" + row.ID, Kind: "tableRow", X: left, Width: contentWidth, Height: 8, Columns: columns, TableRows: []TableRow{textTableRow(doc, "Table Body", cells, "transparent")}})
			}
			taxMode := calculation.TaxModeIntraState
			if input.Company != nil && input.Customer != nil && input.Company.State != nil && input.Customer.State != nil && *input.Company.State != *input.Customer.State {
				taxMode = calculation.TaxModeInterState
			}
			total := calculation.NewEngine().Calculate(items, taxMode)
			place(Block{ID: attrs.ID + "-total", Kind: "tableRow", X: left, Width: contentWidth, Height: 9, Columns: []float64{contentWidth * .7, contentWidth * .3}, TableRows: []TableRow{textTableRow(doc, "Total", []string{"Grand total", money(total.GrandTotal)}, "#f3f4f6")}})
		}
	}
	for pageIndex := range result.Pages {
		header, footer := doc.HeaderStory, doc.FooterStory
		if pageIndex == 0 && doc.Settings.DifferentFirstPage {
			if doc.FirstPageHeaderStory != nil {
				header = doc.FirstPageHeaderStory
			}
			if doc.FirstPageFooterStory != nil {
				footer = doc.FirstPageFooterStory
			}
		}
		appendStory(doc, &result.Pages[pageIndex], header, left, 4, contentWidth, metrics, pageIndex+1, "header")
		appendStory(doc, &result.Pages[pageIndex], footer, left, pageHeight-bottom+2, contentWidth, metrics, pageIndex+1, "footer")
		resolveFields(result.Pages[pageIndex].Blocks, pageIndex+1, len(result.Pages))
	}
	return result, nil
}

func (l *Layout) PageMap(doc *documentv6.Document) PageMap {
	w, h := int64(documentv6.A4WidthDU), int64(documentv6.A4HeightDU)
	if doc.Settings.Orientation == "landscape" {
		w, h = h, w
	}
	return PageMap{PageWidth: w, PageHeight: h, PageCount: len(l.Pages), Ranges: l.Ranges, Diagnostics: l.Diagnostics}
}

func inlineRuns(nodes []documentv6.Node, base documentv6.ResolvedStyle) []Run {
	result := []Run{}
	for _, node := range nodes {
		if node.Type == "hardBreak" {
			result = append(result, Run{Text: "\n", FontFamily: base.FontFamily, FontSizePt: float64(base.FontSize) / 100, Color: base.Color})
			continue
		}
		if node.Type == "pageNumber" || node.Type == "pageCount" {
			result = append(result, Run{Text: "8", FontFamily: base.FontFamily, FontSizePt: float64(base.FontSize) / 100, Bold: base.Bold, Italic: base.Italic, Underline: base.Underline, Strike: base.Strike, Color: base.Color, Highlight: base.Highlight, Field: node.Type})
			continue
		}
		r := Run{Text: node.Text, FontFamily: base.FontFamily, FontSizePt: float64(base.FontSize) / 100, Bold: base.Bold, Italic: base.Italic, Underline: base.Underline, Strike: base.Strike, Color: base.Color, Highlight: base.Highlight}
		for _, mark := range node.Marks {
			switch mark.Type {
			case "bold":
				r.Bold = true
			case "italic":
				r.Italic = true
			case "underline":
				r.Underline = true
			case "strike":
				r.Strike = true
			case "textStyle":
				a := decode[documentv6.TextStyleAttrs](mark.Attrs)
				if a.FontFamily != "" {
					r.FontFamily = a.FontFamily
				}
				if a.FontSize > 0 {
					r.FontSizePt = float64(a.FontSize) / 100
				}
				if a.Color != "" {
					r.Color = a.Color
				}
			case "highlight":
				a := decode[documentv6.ColorAttrs](mark.Attrs)
				r.Highlight = a.Color
			case "link":
				a := decode[documentv6.LinkAttrs](mark.Attrs)
				r.Link = a.Href
			}
		}
		result = append(result, r)
	}
	return result
}

func cellRuns(doc *documentv6.Document, cell documentv6.Node) []Run {
	var runs []Run
	for i, paragraph := range cell.Content {
		attrs := decode[documentv6.ParagraphAttrs](paragraph.Attrs)
		style, _ := documentv6.ResolveParagraphStyle(doc, attrs)
		if i > 0 {
			runs = append(runs, Run{Text: "\n", FontFamily: "Quotier Sans", FontSizePt: 10, Color: "#111827"})
		}
		runs = append(runs, inlineRuns(paragraph.Content, style)...)
	}
	return runs
}

func flattenBlocks(nodes []documentv6.Node, depth int) []documentv6.Node {
	var result []documentv6.Node
	for _, node := range nodes {
		if node.Type != "bulletList" && node.Type != "orderedList" {
			result = append(result, node)
			continue
		}
		attrs := decode[documentv6.ListAttrs](node.Attrs)
		start := attrs.Start
		if start == 0 {
			start = 1
		}
		for index, item := range node.Content {
			for _, child := range item.Content {
				if child.Type == "paragraph" {
					paragraphAttrs := decode[documentv6.ParagraphAttrs](child.Attrs)
					paragraphAttrs.LeftIndent += int64(depth+1) * 1800
					paragraphAttrs.HangingIndent = 900
					prefix := "• "
					if node.Type == "orderedList" {
						prefix = strconv.Itoa(start+index) + ". "
					}
					child.Attrs, _ = json.Marshal(paragraphAttrs)
					child.Content = append([]documentv6.Node{{Type: "text", Text: prefix}}, child.Content...)
					result = append(result, child)
				} else {
					result = append(result, flattenBlocks([]documentv6.Node{child}, depth+1)...)
				}
			}
		}
	}
	return result
}

func appendStory(doc *documentv6.Document, page *Page, story *documentv6.Node, x, y, width float64, metrics layoutir.Metrics, pageNumber int, kind string) {
	if story == nil {
		return
	}
	for _, node := range flattenBlocks(story.Content, 0) {
		switch node.Type {
		case "paragraph":
			attrs := decode[documentv6.ParagraphAttrs](node.Attrs)
			style, err := documentv6.ResolveParagraphStyle(doc, attrs)
			if err != nil {
				continue
			}
			runs := inlineRuns(node.Content, style)
			lines := wrapRuns(runs, width, metrics)
			height := math.Max(1, float64(len(lines))) * metrics.LineHeightMM(float64(style.FontSize)/100)
			page.Blocks = append(page.Blocks, Block{ID: fmt.Sprintf("%s-%d-%s", kind, pageNumber, attrs.ID), Kind: "paragraph", X: x, Y: y, Width: width, Height: height, Align: style.Alignment, Lines: lines})
			y += height
		case "horizontalRule":
			attrs := decode[documentv6.IDAttrs](node.Attrs)
			page.Blocks = append(page.Blocks, Block{ID: fmt.Sprintf("%s-%d-%s", kind, pageNumber, attrs.ID), Kind: "horizontalRule", X: x, Y: y, Width: width, Height: 3})
			y += 3
		}
	}
}

func resolveFields(blocks []Block, page, count int) {
	for blockIndex := range blocks {
		for lineIndex := range blocks[blockIndex].Lines {
			for runIndex := range blocks[blockIndex].Lines[lineIndex].Runs {
				run := &blocks[blockIndex].Lines[lineIndex].Runs[runIndex]
				if run.Field == "pageNumber" {
					run.Text = strconv.Itoa(page)
				}
				if run.Field == "pageCount" {
					run.Text = strconv.Itoa(count)
				}
			}
		}
	}
}

func textTableRow(doc *documentv6.Document, styleName string, values []string, background string) TableRow {
	style, _ := documentv6.ResolveParagraphStyle(doc, documentv6.ParagraphAttrs{Style: styleName})
	cells := make([]TableCell, len(values))
	for i, value := range values {
		cells[i] = TableCell{Text: value, Lines: []Line{{Runs: inlineRuns([]documentv6.Node{{Type: "text", Text: value}}, style)}}, Background: background, Align: style.Alignment}
	}
	return TableRow{Cells: cells}
}

func wrapRuns(runs []Run, maxWidth float64, m layoutir.Metrics) []Line {
	lines := []Line{{}}
	width := 0.0
	for _, run := range runs {
		style := layoutir.TextStyle{Family: fontKey(run.FontFamily), Bold: run.Bold, Italic: run.Italic}
		chunk := ""
		for _, r := range run.Text {
			if r == '\n' {
				if chunk != "" {
					lines[len(lines)-1].Runs = append(lines[len(lines)-1].Runs, withText(run, chunk))
					chunk = ""
				}
				lines = append(lines, Line{})
				width = 0
				continue
			}
			char := string(r)
			advance := m.TextWidthMM(char, run.FontSizePt, style)
			if width+advance > maxWidth && (width > 0 || chunk != "") {
				if chunk != "" {
					lines[len(lines)-1].Runs = append(lines[len(lines)-1].Runs, withText(run, chunk))
					chunk = ""
				}
				lines = append(lines, Line{})
				width = 0
			}
			chunk += char
			width += advance
		}
		if chunk != "" {
			lines[len(lines)-1].Runs = append(lines[len(lines)-1].Runs, withText(run, chunk))
		}
	}
	if len(lines) == 1 && len(lines[0].Runs) == 0 {
		return nil
	}
	return lines
}

func tableLinesHeight(lines []Line, metrics layoutir.Metrics) float64 {
	if len(lines) == 0 {
		return metrics.LineHeightMM(10)
	}
	height := 0.0
	for _, line := range lines {
		maxPt := 10.0
		for _, run := range line.Runs {
			maxPt = math.Max(maxPt, run.FontSizePt)
		}
		height += metrics.LineHeightMM(maxPt)
	}
	return height
}

func withText(run Run, text string) Run { run.Text = text; return run }
func plainText(n documentv6.Node) string {
	var b strings.Builder
	var visit func(documentv6.Node)
	visit = func(x documentv6.Node) {
		if x.Type == "text" {
			b.WriteString(x.Text)
		}
		for _, c := range x.Content {
			visit(c)
		}
	}
	visit(n)
	return b.String()
}
func decode[T any](raw json.RawMessage) T { var value T; _ = json.Unmarshal(raw, &value); return value }
func defaultString(v, f string) string {
	if v == "" {
		return f
	}
	return v
}
func fontKey(v string) string {
	if v == "Quotier Serif" {
		return "serif"
	}
	if v == "Quotier Mono" {
		return "mono"
	}
	return "sans"
}
func money(v int64) string { return fmt.Sprintf("₹%.2f", float64(v)/100) }

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
	Color      string
	Highlight  string
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

	for _, node := range doc.Body.Content {
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
			fontRuns := inlineRuns(node.Content)
			available := contentWidth - float64(attrs.LeftIndent+attrs.RightIndent)/duPerMM
			if available < 10 {
				available = 10
			}
			firstLine := float64(attrs.FirstLineIndent) / duPerMM
			lines := wrapRuns(fontRuns, math.Max(10, available-firstLine), metrics)
			lineHeight := 1.2
			if attrs.LineHeight > 0 {
				lineHeight = attrs.LineHeight
			}
			maxPt := 10.0
			for _, run := range fontRuns {
				if run.FontSizePt > maxPt {
					maxPt = run.FontSizePt
				}
			}
			height := float64(attrs.SpacingBefore+attrs.SpacingAfter)/duPerMM + math.Max(1, float64(len(lines)))*metrics.LineHeightMM(maxPt)*lineHeight/1.2
			x := left + float64(attrs.LeftIndent)/duPerMM
			place(Block{ID: attrs.ID, Kind: "paragraph", X: x, Width: available, Height: height, Align: defaultString(attrs.Alignment, "left"), FirstLine: firstLine, TextTop: float64(attrs.SpacingBefore) / duPerMM, Lines: lines})
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
				cells := make([]TableCell, len(rowNode.Content))
				rowHeight := 8.0
				for i, cell := range rowNode.Content {
					ca := decode[documentv6.TableCellAttrs](cell.Attrs)
					runs := cellRuns(cell)
					lines := wrapRuns(runs, math.Max(1, columns[i]-3), metrics)
					cells[i] = TableCell{Lines: lines, Text: plainText(cell), Background: defaultString(ca.Background, "transparent"), Align: defaultString(ca.Alignment, "left")}
					rowHeight = math.Max(rowHeight, math.Max(1, float64(len(lines)))*metrics.LineHeightMM(10)+2)
				}
				place(Block{ID: fmt.Sprintf("%s-row-%d", attrs.ID, rowIndex), Kind: "tableRow", X: x, Width: sum, Height: rowHeight, Columns: columns, TableRows: []TableRow{{Cells: cells}}})
			}
		case "lineItemTable":
			attrs := decode[documentv6.LineItemTableAttrs](node.Attrs)
			columns := []float64{contentWidth * .46, contentWidth * .12, contentWidth * .18, contentWidth * .12, contentWidth * .12}
			head := textTableRow([]string{"Description", "Qty", "Rate", "Tax", "Amount"}, "#e5e7eb")
			place(Block{ID: attrs.ID + "-header", Kind: "tableRow", X: left, Width: contentWidth, Height: 8, Columns: columns, TableRows: []TableRow{head}})
			items := make([]calculation.LineItemInput, 0, len(attrs.Rows))
			for _, row := range attrs.Rows {
				items = append(items, calculation.LineItemInput{ID: row.ID, QuantityFloat: row.Quantity, Rate: row.Rate, Discount: row.Discount, TaxRateFloat: row.TaxRate, TaxInclusive: row.TaxInclusive})
				amount := int64(math.Round(row.Quantity*float64(row.Rate))) - row.Discount
				cells := []string{row.Description, strconv.FormatFloat(row.Quantity, 'f', -1, 64), money(row.Rate), strconv.FormatFloat(row.TaxRate, 'f', -1, 64) + "%", money(amount)}
				place(Block{ID: attrs.ID + "-" + row.ID, Kind: "tableRow", X: left, Width: contentWidth, Height: 8, Columns: columns, TableRows: []TableRow{textTableRow(cells, "transparent")}})
			}
			taxMode := calculation.TaxModeIntraState
			if input.Company != nil && input.Customer != nil && input.Company.State != nil && input.Customer.State != nil && *input.Company.State != *input.Customer.State {
				taxMode = calculation.TaxModeInterState
			}
			total := calculation.NewEngine().Calculate(items, taxMode)
			place(Block{ID: attrs.ID + "-total", Kind: "tableRow", X: left, Width: contentWidth, Height: 9, Columns: []float64{contentWidth * .7, contentWidth * .3}, TableRows: []TableRow{textTableRow([]string{"Grand total", money(total.GrandTotal)}, "#f3f4f6")}})
		}
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

func inlineRuns(nodes []documentv6.Node) []Run {
	result := []Run{}
	for _, node := range nodes {
		r := Run{Text: node.Text, FontFamily: "Quotier Sans", FontSizePt: 10, Color: "#111827"}
		for _, mark := range node.Marks {
			switch mark.Type {
			case "bold":
				r.Bold = true
			case "italic":
				r.Italic = true
			case "underline":
				r.Underline = true
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
			}
		}
		result = append(result, r)
	}
	return result
}

func cellRuns(cell documentv6.Node) []Run {
	var runs []Run
	for i, paragraph := range cell.Content {
		if i > 0 {
			runs = append(runs, Run{Text: "\n", FontFamily: "Quotier Sans", FontSizePt: 10, Color: "#111827"})
		}
		runs = append(runs, inlineRuns(paragraph.Content)...)
	}
	return runs
}

func textTableRow(values []string, background string) TableRow {
	cells := make([]TableCell, len(values))
	for i, value := range values {
		cells[i] = TableCell{Text: value, Lines: []Line{{Runs: []Run{{Text: value, FontFamily: "Quotier Sans", FontSizePt: 8, Color: "#111827"}}}}, Background: background, Align: "left"}
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

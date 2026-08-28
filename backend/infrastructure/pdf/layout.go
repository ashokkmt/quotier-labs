package pdf

import (
	"fmt"
	"os"
	"strings"

	"github.com/go-pdf/fpdf"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain/quotation"
)

type LayoutEngine struct {
	pdf   *fpdf.Fpdf
	input document.GeneratorInput
}

func NewLayoutEngine(pdf *fpdf.Fpdf, input document.GeneratorInput) *LayoutEngine {
	return &LayoutEngine{
		pdf:   pdf,
		input: input,
	}
}

func (le *LayoutEngine) Render(doc *quotation.Document) error {
	le.renderHeader()
	le.renderCustomer()
	if len(doc.Children) > 0 {
		for _, block := range doc.Children {
			if err := le.renderBlock(block); err != nil {
				return err
			}
		}
		return nil
	}

	// Render arbitrary sections
	for _, row := range doc.Rows {
		for _, col := range row.Columns {
			for _, sec := range col.Sections {
				if !sec.Visibility {
					continue
				}
				le.renderSection(sec)
			}
		}
	}

	le.renderTotals()
	return nil
}

// renderBlock renders only document content. Editor metadata and controls are
// intentionally absent from this path.
func (le *LayoutEngine) renderBlock(block quotation.Block) error {
	return le.renderBlockInWidth(block, 0)
}

// renderBlockInWidth projects the same container direction/basis data used by
// the editor into bounded PDF columns. A width of zero uses the page content
// width, preserving the legacy full-width path.
func (le *LayoutEngine) renderBlockInWidth(block quotation.Block, contentWidth float64) error {
	if !block.Visible {
		return nil
	}
	if block.Kind == "container" || block.WidgetType == "container" || block.WidgetType == "" {
		if fmt.Sprint(block.Layout["direction"]) == "horizontal" && len(block.Children) > 0 {
			pageWidth, _ := le.pdf.GetPageSize()
			left, _, right, _ := le.pdf.GetMargins()
			startX, startY := le.pdf.GetX(), le.pdf.GetY()
			available := contentWidth
			if available == 0 {
				available = pageWidth - right - startX
				if startX < left {
					available = pageWidth - left - right
				}
			}
			gap := map[string]float64{"none": 0, "xs": 1, "sm": 2, "md": 4, "lg": 8}[fmt.Sprint(block.Layout["gap"])]
			available -= gap * float64(len(block.Children)-1)
			x, maxY := startX, startY
			for _, child := range block.Children {
				basis, _ := child.Layout["basis"].(float64)
				if basis <= 0 {
					basis = 10000 / float64(len(block.Children))
				}
				width := available * basis / 10000
				le.pdf.SetXY(x, startY)
				if err := le.renderBlockInWidth(child, width); err != nil {
					return err
				}
				if y := le.pdf.GetY(); y > maxY {
					maxY = y
				}
				x += width + gap
			}
			le.pdf.SetXY(startX, maxY)
			return nil
		}
		for _, child := range block.Children {
			if err := le.renderBlockInWidth(child, contentWidth); err != nil {
				return err
			}
		}
		return nil
	}
	pdf := le.pdf
	text := func() string {
		if value, ok := block.Settings["value"]; ok && value != nil {
			return fmt.Sprint(value)
		}
		if value, ok := block.Settings["text"]; ok && value != nil {
			return fmt.Sprint(value)
		}
		return ""
	}
	fontSize := func(defaultSize float64) float64 {
		switch fmt.Sprint(block.Layout["fontSize"]) {
		case "xs":
			return 8
		case "sm":
			return 9
		case "md":
			return 10
		case "lg":
			return 12
		case "xl":
			return 14
		case "2xl":
			return 18
		default:
			return defaultSize
		}
	}
	fontStyle := func(defaultStyle string) string {
		switch fmt.Sprint(block.Layout["fontWeight"]) {
		case "normal":
			return ""
		case "medium", "semibold", "bold":
			return "B"
		default:
			return defaultStyle
		}
	}
	applyTextColor := func() {
		switch fmt.Sprint(block.Layout["textColor"]) {
		case "muted":
			pdf.SetTextColor(100, 116, 139)
		case "primary":
			pdf.SetTextColor(37, 99, 235)
		case "success":
			pdf.SetTextColor(5, 150, 105)
		case "danger":
			pdf.SetTextColor(220, 38, 38)
		default:
			pdf.SetTextColor(15, 23, 42)
		}
	}
	align := func() string {
		switch fmt.Sprint(block.Layout["textAlign"]) {
		case "center":
			return "C"
		case "right":
			return "R"
		default:
			return "L"
		}
	}
	widgetType := strings.TrimPrefix(block.WidgetType, "field.")
	switch widgetType {
	case "heading":
		if value := text(); value != "" {
			applyTextColor()
			pdf.SetFont("Arial", fontStyle("B"), fontSize(14))
			pdf.MultiCell(contentWidth, 8, value, "", align(), false)
		}
	case "text", "textarea":
		if value := text(); value != "" {
			applyTextColor()
			pdf.SetFont("Arial", fontStyle(""), fontSize(10))
			pdf.MultiCell(contentWidth, 6, value, "", align(), false)
		}
	case "number", "currency", "date", "select", "boolean":
		if value := text(); value != "" {
			applyTextColor()
			pdf.SetFont("Arial", fontStyle(""), fontSize(10))
			pdf.CellFormat(contentWidth, 6, value, "", 1, align(), false, 0, "")
		}
	case "divider":
		pageWidth, _ := pdf.GetPageSize()
		left, _, right, _ := pdf.GetMargins()
		switch fmt.Sprint(block.Settings["color"]) {
		case "primary":
			pdf.SetDrawColor(37, 99, 235)
		case "success":
			pdf.SetDrawColor(5, 150, 105)
		case "danger":
			pdf.SetDrawColor(220, 38, 38)
		case "muted":
			pdf.SetDrawColor(148, 163, 184)
		default:
			pdf.SetDrawColor(71, 85, 105)
		}
		weight := 1.0
		if raw, ok := block.Settings["weight"].(float64); ok {
			weight = raw
		}
		if weight < 1 {
			weight = 1
		}
		if weight > 12 {
			weight = 12
		}
		pdf.SetLineWidth(weight * 0.35)
		start := pdf.GetX()
		if start < left {
			start = left
		}
		end := pageWidth - right
		if contentWidth > 0 {
			end = start + contentWidth
		}
		pdf.Line(start, pdf.GetY(), end, pdf.GetY())
		pdf.SetLineWidth(0.2)
		pdf.Ln(4)
	case "spacer":
		pdf.Ln(8)
	case "image", "signature", "stamp":
		if source, ok := block.Settings["src"].(string); ok && source != "" {
			if _, err := os.Stat(source); err == nil {
				width := 50.0
				if raw, ok := block.Layout["imageWidth"].(float64); ok {
					width = 50 * raw / 100
				}
				if contentWidth > 0 && width > contentWidth {
					width = contentWidth
				}
				pdf.ImageOptions(source, pdf.GetX(), pdf.GetY(), width, 0, false, fpdf.ImageOptions{ReadDpi: true}, 0, "")
				pdf.Ln(35)
			}
		}
	case "table":
		// Tables created by the quotation editor continue through the existing
		// calculation-aware table renderer when represented in the section model.
	case "quotation-summary":
		le.renderTotals()
	default:
		for _, child := range block.Children {
			if err := le.renderBlockInWidth(child, contentWidth); err != nil {
				return err
			}
		}
	}
	return nil
}

func (le *LayoutEngine) renderHeader() {
	pdf := le.pdf
	comp := le.input.Company

	pdf.SetFont("Arial", "B", 16)
	pdf.CellFormat(0, 10, comp.Name, "", 1, "L", false, 0, "")

	pdf.SetFont("Arial", "", 10)
	if comp.Address != nil && *comp.Address != "" {
		// MultiCell is better for multi-line address
		pdf.MultiCell(0, 5, *comp.Address, "", "L", false)
	}
	if comp.State != nil && *comp.State != "" {
		pdf.CellFormat(0, 5, "State: "+*comp.State, "", 1, "L", false, 0, "")
	}
	if comp.TaxID != nil && *comp.TaxID != "" {
		pdf.CellFormat(0, 5, "Tax ID / GSTIN: "+*comp.TaxID, "", 1, "L", false, 0, "")
	}

	// Quotation Meta
	pdf.Ln(5)
	pdf.SetFont("Arial", "B", 14)
	pdf.CellFormat(0, 8, "QUOTATION", "", 1, "R", false, 0, "")
	pdf.SetFont("Arial", "", 10)
	pdf.CellFormat(0, 5, "Number: "+le.input.Quotation.Number, "", 1, "R", false, 0, "")
	pdf.CellFormat(0, 5, "Date: "+le.input.Quotation.CreatedAt.Format("02 Jan 2006"), "", 1, "R", false, 0, "")
	pdf.Ln(5)
}

func (le *LayoutEngine) renderCustomer() {
	pdf := le.pdf
	cust := le.input.Customer

	if cust == nil {
		return
	}

	pdf.SetFont("Arial", "B", 11)
	pdf.CellFormat(0, 6, "Bill To:", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 10)
	pdf.CellFormat(0, 5, cust.Name, "", 1, "L", false, 0, "")

	if cust.CompanyName != nil && *cust.CompanyName != "" {
		pdf.CellFormat(0, 5, *cust.CompanyName, "", 1, "L", false, 0, "")
	}

	if cust.Address != nil && *cust.Address != "" {
		pdf.MultiCell(0, 5, *cust.Address, "", "L", false)
	}
	if cust.State != nil && *cust.State != "" {
		pdf.CellFormat(0, 5, "State: "+*cust.State, "", 1, "L", false, 0, "")
	}
	if cust.GSTIN != nil && *cust.GSTIN != "" {
		pdf.CellFormat(0, 5, "GSTIN: "+*cust.GSTIN, "", 1, "L", false, 0, "")
	}
	pdf.Ln(10)
}

func (le *LayoutEngine) renderSection(sec quotation.Section) {
	pdf := le.pdf

	if sec.Title != "" {
		pdf.SetFont("Arial", "B", 12)
		pdf.CellFormat(0, 8, sec.Title, "B", 1, "L", false, 0, "")
		pdf.Ln(2)
	}

	pdf.SetFont("Arial", "", 10)
	for _, field := range sec.Fields {
		val := ""
		if field.Value != nil {
			val = fmt.Sprintf("%v", field.Value)
		}
		if val != "" {
			pdf.SetFont("Arial", "B", 10)
			pdf.CellFormat(40, 6, field.Label+":", "", 0, "L", false, 0, "")
			pdf.SetFont("Arial", "", 10)
			pdf.MultiCell(0, 6, val, "", "L", false)
		}
	}

	for _, table := range sec.Tables {
		le.renderTable(table)
	}

	pdf.Ln(5)
}

func (le *LayoutEngine) renderTable(table quotation.TableDefinition) {
	pdf := le.pdf

	if table.Name != "" {
		pdf.SetFont("Arial", "I", 10)
		pdf.CellFormat(0, 6, table.Name, "", 1, "L", false, 0, "")
	}

	// Calculate widths (naive equal split for now)
	pageWidth, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usableWidth := pageWidth - left - right

	colWidth := usableWidth
	if len(table.Columns) > 0 {
		colWidth = usableWidth / float64(len(table.Columns))
	}

	// Header
	pdf.SetFont("Arial", "B", 10)
	pdf.SetFillColor(240, 240, 240)
	for _, col := range table.Columns {
		pdf.CellFormat(colWidth, 8, col.Label, "1", 0, "L", true, 0, "")
	}
	pdf.Ln(-1)

	// Rows
	pdf.SetFont("Arial", "", 10)
	for _, row := range table.Rows {
		for _, col := range table.Columns {
			val := ""
			if v, ok := row[col.ID]; ok && v != nil {
				val = fmt.Sprintf("%v", v)
			}
			pdf.CellFormat(colWidth, 7, val, "1", 0, "L", false, 0, "")
		}
		pdf.Ln(-1)
	}
}

func (le *LayoutEngine) renderTotals() {
	pdf := le.pdf
	q := le.input.Quotation

	pageWidth, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	usableWidth := pageWidth - left - right

	offset := usableWidth - 80 // place totals on the right

	pdf.Ln(5)
	pdf.SetFont("Arial", "", 10)

	drawRow := func(label, value string, bold bool) {
		pdf.SetX(left + offset)
		if bold {
			pdf.SetFont("Arial", "B", 10)
		} else {
			pdf.SetFont("Arial", "", 10)
		}
		pdf.CellFormat(40, 6, label, "", 0, "R", false, 0, "")
		pdf.CellFormat(40, 6, value, "", 1, "R", false, 0, "")
	}

	drawRow("Subtotal:", formatCurrency(q.Subtotal), false)

	if q.DiscountTotal > 0 {
		drawRow("Discount:", "-"+formatCurrency(q.DiscountTotal), false)
		drawRow("Taxable Amount:", formatCurrency(q.TaxableTotal), false)
	}

	if q.CGSTTotal > 0 {
		drawRow("CGST:", formatCurrency(q.CGSTTotal), false)
	}
	if q.SGSTTotal > 0 {
		drawRow("SGST:", formatCurrency(q.SGSTTotal), false)
	}
	if q.IGSTTotal > 0 {
		drawRow("IGST:", formatCurrency(q.IGSTTotal), false)
	}

	drawRow("Grand Total:", formatCurrency(q.GrandTotal), true)
}

func formatCurrency(val int64) string {
	v := float64(val) / 100.0
	return fmt.Sprintf("Rs %.2f", v)
}

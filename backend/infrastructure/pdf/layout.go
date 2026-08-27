package pdf

import (
	"fmt"

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

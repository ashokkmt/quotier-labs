package flowlayout

import (
	"math"
	"strconv"

	"quotierlabs/backend/application/documentlayout"
	"quotierlabs/backend/domain/calculation"
	"quotierlabs/backend/domain/documentv6"
)

func layoutLineItems(doc *documentv6.Document, attrs documentv6.LineItemTableAttrs, input ResolveInput, maxWidth float64, metrics documentlayout.Metrics) (Block, []Block, []Block) {
	columns := attrs.Columns
	if len(columns) == 0 {
		columns = documentv6.DefaultLineItemColumns()
	}
	width := maxWidth
	if attrs.Width > 0 {
		width = math.Min(maxWidth, float64(attrs.Width)/duPerMM)
	}
	physical := make([]float64, len(columns))
	configured := 0.0
	for index, column := range columns {
		physical[index] = float64(column.Width) / duPerMM
		configured += physical[index]
	}
	if configured == 0 {
		for index, column := range columns {
			physical[index] = width * lineItemColumnWeight(column.Key) / lineItemWeights(columns)
		}
	} else {
		for index := range physical {
			physical[index] = width * physical[index] / configured
		}
	}
	headings := make([]string, len(columns))
	for index, column := range columns {
		headings[index] = column.Label
		if headings[index] == "" {
			headings[index] = lineItemLabel(column.Key)
		}
	}
	headerRow, headerHeight := sizedTextRow(textTableRow(doc, "Table Header", headings, defaultString(attrs.HeaderBackground, "#e5e7eb")), physical, metrics)
	header := Block{ID: attrs.ID + "-header", Kind: "tableRow", Width: width, Height: headerHeight, Columns: physical, BorderColor: "#d1d5db", BorderPreset: "all", TableRows: []TableRow{headerRow}}
	inputs := make([]calculation.LineItemInput, len(attrs.Rows))
	for index, row := range attrs.Rows {
		inputs[index] = calculation.LineItemInput{ID: row.ID, QuantityFloat: row.Quantity, Rate: row.Rate, Discount: row.Discount, TaxRateFloat: row.TaxRate, TaxInclusive: row.TaxInclusive}
	}
	taxMode := calculation.TaxModeIntraState
	if input.Company != nil && input.Customer != nil && input.Company.State != nil && input.Customer.State != nil && *input.Company.State != *input.Customer.State {
		taxMode = calculation.TaxModeInterState
	}
	result := calculation.NewEngine().Calculate(inputs, taxMode)
	rows := make([]Block, len(attrs.Rows))
	for index, row := range attrs.Rows {
		values := make([]string, len(columns))
		for columnIndex, column := range columns {
			values[columnIndex] = lineItemValue(column.Key, row, result.LineItems[index])
		}
		body, height := sizedTextRow(textTableRow(doc, "Table Body", values, "transparent"), physical, metrics)
		rows[index] = Block{ID: attrs.ID + "-" + row.ID, Kind: "tableRow", Width: width, Height: height, Columns: physical, BorderColor: "#d1d5db", BorderPreset: "all", TableRows: []TableRow{body}}
	}
	showGrand := attrs.ShowGrandTotal || !(attrs.ShowSubtotal || attrs.ShowDiscount || attrs.ShowTax)
	totals := make([]Block, 0, 4)
	addTotal := func(key, label string, amount int64) {
		totalColumns := []float64{width * .7, width * .3}
		row, height := sizedTextRow(textTableRow(doc, "Total", []string{label, money(amount)}, "#f3f4f6"), totalColumns, metrics)
		totals = append(totals, Block{ID: attrs.ID + "-" + key, Kind: "tableRow", Width: width, Height: height, Columns: totalColumns, BorderColor: "#d1d5db", BorderPreset: "all", TableRows: []TableRow{row}})
	}
	if attrs.ShowSubtotal {
		addTotal("subtotal", "Subtotal", result.Subtotal)
	}
	if attrs.ShowDiscount {
		addTotal("discount", "Discount", result.DiscountTotal)
	}
	if attrs.ShowTax {
		addTotal("tax", "Tax", result.CGSTTotal+result.SGSTTotal+result.IGSTTotal)
	}
	if showGrand {
		addTotal("grand-total", "Grand total", result.GrandTotal)
	}
	return header, rows, totals
}

func sizedTextRow(row TableRow, columns []float64, metrics documentlayout.Metrics) (TableRow, float64) {
	height := 8.0
	for index := range row.Cells {
		row.Cells[index].Column = index
		row.Cells[index].Colspan = 1
		row.Cells[index].Rowspan = 1
		row.Cells[index].Padding = 1.5
		if index < len(columns) {
			row.Cells[index].Width = columns[index]
		}
		var runs []Run
		for _, line := range row.Cells[index].Lines {
			runs = append(runs, line.Runs...)
		}
		row.Cells[index].Lines = wrapRuns(runs, math.Max(1, row.Cells[index].Width-3), metrics)
		height = math.Max(height, tableLinesHeight(row.Cells[index].Lines, metrics)+3)
	}
	return row, height
}

func withCalculatedTotals(doc *documentv6.Document, input ResolveInput) ResolveInput {
	if input.Quotation == nil {
		return input
	}
	var lines []calculation.LineItemInput
	for _, node := range doc.Body.Content {
		if node.Type != "lineItemTable" {
			continue
		}
		attrs := decode[documentv6.LineItemTableAttrs](node.Attrs)
		for _, row := range attrs.Rows {
			lines = append(lines, calculation.LineItemInput{ID: row.ID, QuantityFloat: row.Quantity, Rate: row.Rate, Discount: row.Discount, TaxRateFloat: row.TaxRate, TaxInclusive: row.TaxInclusive})
		}
	}
	taxMode := calculation.TaxModeIntraState
	if input.Company != nil && input.Customer != nil && input.Company.State != nil && input.Customer.State != nil && *input.Company.State != *input.Customer.State {
		taxMode = calculation.TaxModeInterState
	}
	result := calculation.NewEngine().Calculate(lines, taxMode)
	quotation := *input.Quotation
	quotation.Subtotal, quotation.DiscountTotal, quotation.TaxableTotal = result.Subtotal, result.DiscountTotal, result.TaxableTotal
	quotation.CGSTTotal, quotation.SGSTTotal, quotation.IGSTTotal, quotation.GrandTotal = result.CGSTTotal, result.SGSTTotal, result.IGSTTotal, result.GrandTotal
	input.Quotation = &quotation
	return input
}

func lineItemWeights(columns []documentv6.LineItemColumn) float64 {
	total := 0.0
	for _, column := range columns {
		total += lineItemColumnWeight(column.Key)
	}
	return total
}
func lineItemColumnWeight(key string) float64 {
	if key == "description" {
		return 4
	}
	return 1.25
}
func lineItemLabel(key string) string {
	labels := map[string]string{"description": "Description", "quantity": "Qty", "rate": "Rate", "discount": "Discount", "tax_rate": "Tax %", "taxable": "Taxable", "tax": "Tax", "amount": "Amount"}
	return labels[key]
}
func lineItemValue(key string, row documentv6.LineItem, result calculation.LineItemResult) string {
	switch key {
	case "description":
		return row.Description
	case "quantity":
		return strconv.FormatFloat(row.Quantity, 'f', -1, 64)
	case "rate":
		return money(row.Rate)
	case "discount":
		return money(row.Discount)
	case "tax_rate":
		return strconv.FormatFloat(row.TaxRate, 'f', -1, 64) + "%"
	case "taxable":
		return money(result.Taxable)
	case "tax":
		return money(result.CGST + result.SGST + result.IGST)
	case "amount":
		return money(result.GrandTotal)
	default:
		return ""
	}
}

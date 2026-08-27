package quotation

import (
	"fmt"
	"strconv"

	"quotierlabs/backend/domain/calculation"
)

func parseFloat(val interface{}) float64 {
	switch v := val.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case string:
		f, _ := strconv.ParseFloat(v, 64)
		return f
	default:
		return 0
	}
}

func parseInt64(val interface{}) int64 {
	switch v := val.(type) {
	case float64:
		return int64(v)
	case int:
		return int64(v)
	case string:
		i, _ := strconv.ParseInt(v, 10, 64)
		return i
	default:
		return 0
	}
}

func ExtractLineItems(doc *Document) []calculation.LineItemInput {
	var lines []calculation.LineItemInput

	if doc == nil {
		return lines
	}

	for _, row := range doc.Rows {
		for _, col := range row.Columns {
			for _, sec := range col.Sections {
				for _, tbl := range sec.Tables {
					if tbl.HasTotals {
						qtyCol := ""
						rateCol := ""
						discountCol := ""
						taxRateCol := ""
						taxIncCol := ""

						if tbl.TotalsConfig != nil {
							if c, ok := tbl.TotalsConfig["qty_col"].(string); ok { qtyCol = c }
							if c, ok := tbl.TotalsConfig["rate_col"].(string); ok { rateCol = c }
							if c, ok := tbl.TotalsConfig["discount_col"].(string); ok { discountCol = c }
							if c, ok := tbl.TotalsConfig["tax_rate_col"].(string); ok { taxRateCol = c }
							if c, ok := tbl.TotalsConfig["tax_inclusive_col"].(string); ok { taxIncCol = c }
						}

						for i, r := range tbl.Rows {
							qty := 1.0
							if qtyCol != "" && r[qtyCol] != nil {
								qty = parseFloat(r[qtyCol])
							}
							
							rate := int64(0)
							if rateCol != "" && r[rateCol] != nil {
								rate = parseInt64(r[rateCol])
							}

							discount := int64(0)
							if discountCol != "" && r[discountCol] != nil {
								discount = parseInt64(r[discountCol])
							}

							taxRate := 0.0
							if taxRateCol != "" && r[taxRateCol] != nil {
								taxRate = parseFloat(r[taxRateCol])
							}

							taxInc := false
							if taxIncCol != "" && r[taxIncCol] != nil {
								if b, ok := r[taxIncCol].(bool); ok {
									taxInc = b
								}
							}

							lines = append(lines, calculation.LineItemInput{
								ID:            fmt.Sprintf("%s-row-%d", tbl.ID, i),
								QuantityFloat: qty,
								Rate:          rate,
								Discount:      discount,
								TaxRateFloat:  taxRate,
								TaxInclusive:  taxInc,
							})
						}
					}
				}
			}
		}
	}
	return lines
}

func UpdateDocumentTotals(doc *Document, result calculation.CalculationResult) {
	// Re-map calculation results back into document tables if we wanted to
	// For MVP, we just store the global totals on the Quotation entity.
}

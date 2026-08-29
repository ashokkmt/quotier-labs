package quotation

import (
	"encoding/json"
	"fmt"
	"strconv"

	"quotierlabs/backend/domain/calculation"
	"quotierlabs/backend/domain/documentmodel"
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

// ExtractV5LineItems reads only the controlled table-story line_items shape. Arbitrary story
// content is never interpreted as executable calculations.
func ExtractV5LineItems(doc *documentmodel.Document) []calculation.LineItemInput {
	var lines []calculation.LineItemInput
	if doc == nil {
		return lines
	}
	for _, story := range doc.Stories {
		if story.Kind != "table" {
			continue
		}
		var payload struct {
			LineItems []struct {
				ID           string  `json:"id"`
				Quantity     float64 `json:"quantity"`
				Rate         int64   `json:"rate"`
				Discount     int64   `json:"discount"`
				TaxRate      float64 `json:"tax_rate"`
				TaxInclusive bool    `json:"tax_inclusive"`
			} `json:"line_items"`
		}
		if json.Unmarshal(story.Content, &payload) != nil {
			continue
		}
		for i, item := range payload.LineItems {
			id := item.ID
			if id == "" {
				id = fmt.Sprintf("%s-row-%d", story.ID, i)
			}
			if item.Quantity == 0 {
				item.Quantity = 1
			}
			lines = append(lines, calculation.LineItemInput{ID: id, QuantityFloat: item.Quantity, Rate: item.Rate, Discount: item.Discount, TaxRateFloat: item.TaxRate, TaxInclusive: item.TaxInclusive})
		}
	}
	return lines
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
							if c, ok := tbl.TotalsConfig["qty_col"].(string); ok {
								qtyCol = c
							}
							if c, ok := tbl.TotalsConfig["rate_col"].(string); ok {
								rateCol = c
							}
							if c, ok := tbl.TotalsConfig["discount_col"].(string); ok {
								discountCol = c
							}
							if c, ok := tbl.TotalsConfig["tax_rate_col"].(string); ok {
								taxRateCol = c
							}
							if c, ok := tbl.TotalsConfig["tax_inclusive_col"].(string); ok {
								taxIncCol = c
							}
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

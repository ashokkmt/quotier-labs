package quotation

import (
	"encoding/json"
	"fmt"

	"quotierlabs/backend/domain/calculation"
	"quotierlabs/backend/domain/documentmodel"
)

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

package quotation

import (
	"encoding/json"

	"quotierlabs/backend/domain/calculation"
	"quotierlabs/backend/domain/documentv6"
)

func ExtractV6LineItems(doc *documentv6.Document) []calculation.LineItemInput {
	var lines []calculation.LineItemInput
	if doc == nil {
		return lines
	}
	for _, node := range doc.Body.Content {
		if node.Type != "lineItemTable" {
			continue
		}
		var attrs documentv6.LineItemTableAttrs
		if json.Unmarshal(node.Attrs, &attrs) != nil {
			continue
		}
		for _, item := range attrs.Rows {
			lines = append(lines, calculation.LineItemInput{ID: item.ID, QuantityFloat: item.Quantity, Rate: item.Rate, Discount: item.Discount, TaxRateFloat: item.TaxRate, TaxInclusive: item.TaxInclusive})
		}
	}
	return lines
}

package calculation

import (
	"math"
)

// RoundToPaise rounds to nearest integer minor unit (paise)
func RoundToPaise(val float64) int64 {
	return int64(math.Round(val))
}

// RoundToRupee rounds to nearest 100 paise (1 rupee)
func RoundToRupee(val float64) int64 {
	// e.g. 11850 paise -> 118.50 INR -> 119 INR -> 11900 paise
	rupees := math.Round(val / 100.0)
	return int64(rupees * 100)
}

type Engine struct {
}

func NewEngine() *Engine {
	return &Engine{}
}

func (e *Engine) Calculate(lines []LineItemInput, taxMode TaxMode) CalculationResult {
	res := CalculationResult{
		LineItems: make([]LineItemResult, len(lines)),
	}

	for i, line := range lines {
		var amount, taxable, taxTotal, cgst, sgst, igst int64

		if line.TaxInclusive {
			// tax-inclusive
			// amount = qty * rate (rate includes tax)
			amountFloat := line.QuantityFloat * float64(line.Rate)
			amount = RoundToPaise(amountFloat)

			// For inclusive, we consider amount as the base before discount?
			// Usually discount on inclusive price means (Amount - Discount) is inclusive of tax.
			// line_taxable = inclusive_amount / (1 + line_rate)

			inclusiveAfterDiscount := float64(amount - line.Discount)
			if inclusiveAfterDiscount < 0 {
				inclusiveAfterDiscount = 0
			}

			taxableFloat := inclusiveAfterDiscount / (1.0 + (line.TaxRateFloat / 100.0))
			taxable = RoundToPaise(taxableFloat)
			taxTotal = RoundToPaise(inclusiveAfterDiscount) - taxable

		} else {
			// tax-exclusive
			amountFloat := line.QuantityFloat * float64(line.Rate)
			amount = RoundToPaise(amountFloat)

			taxable = amount - line.Discount
			if taxable < 0 {
				taxable = 0
			}

			taxFloat := float64(taxable) * (line.TaxRateFloat / 100.0)
			taxTotal = RoundToPaise(taxFloat)
		}

		if taxMode == TaxModeIntraState {
			cgst = RoundToPaise(float64(taxTotal) / 2.0)
			sgst = taxTotal - cgst // ensure sum is exact
		} else if taxMode == TaxModeInterState {
			igst = taxTotal
		}

		lineGrandTotal := taxable + cgst + sgst + igst

		res.LineItems[i] = LineItemResult{
			ID:         line.ID,
			Quantity:   line.QuantityFloat,
			Rate:       line.Rate,
			Amount:     amount,
			Discount:   line.Discount,
			Taxable:    taxable,
			CGST:       cgst,
			SGST:       sgst,
			IGST:       igst,
			GrandTotal: lineGrandTotal,
			TaxRate:    line.TaxRateFloat,
		}

		res.Subtotal += amount
		res.DiscountTotal += line.Discount
		res.TaxableTotal += taxable
		res.CGSTTotal += cgst
		res.SGSTTotal += sgst
		res.IGSTTotal += igst
	}

	totalGst := res.CGSTTotal + res.SGSTTotal + res.IGSTTotal
	// Grand total is rounded to the nearest Rupee (100 paise)
	res.GrandTotal = RoundToRupee(float64(res.TaxableTotal + totalGst))

	return res
}

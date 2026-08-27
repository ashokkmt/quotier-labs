package calculation

type TaxMode string

const (
	TaxModeIntraState TaxMode = "INTRA_STATE" // CGST + SGST
	TaxModeInterState TaxMode = "INTER_STATE" // IGST
	TaxModeNone       TaxMode = "NONE"
)

type PricingMode string

const (
	PricingModeExclusive PricingMode = "TAX_EXCLUSIVE"
	PricingModeInclusive PricingMode = "TAX_INCLUSIVE"
)

type LineItemInput struct {
	ID           string
	Quantity     int64 // Stored with assumed precision or just raw multiplier? Typically qty is decimal. 
	// Wait, ADR-7 says "Money value object (integer minor units)".
	// Does qty have minor units? "qty=1" in Phase 8 tests is 1. If it's 1.5, how is it represented? Let's use float64 for Qty or a scaled int.
	// We'll use float64 for Quantity because quantity isn't currency, and rates are currency. 
	// The plan says "qty=1, rate=10000 (₹100.00)". Let's use float64 for Qty to avoid losing precision on e.g. 1.5 kg.
	QuantityFloat float64
	Rate          int64 // minor units
	Discount      int64 // minor units, applied before tax
	TaxRate       int64 // percentage * 100 (e.g. 1800 for 18%), or just float64? Let's use float64 for TaxRate (e.g. 18.0) to be safe, or int64 of basis points. Let's use float64 for TaxRate.
	TaxRateFloat  float64 // e.g. 18.0 for 18%
	TaxInclusive  bool
}

type LineItemResult struct {
	ID           string
	Quantity     float64
	Rate         int64
	Amount       int64
	Discount     int64
	Taxable      int64
	CGST         int64
	SGST         int64
	IGST         int64
	GrandTotal   int64
	TaxRate      float64
}

type CalculationResult struct {
	Subtotal      int64
	DiscountTotal int64
	TaxableTotal  int64
	CGSTTotal     int64
	SGSTTotal     int64
	IGSTTotal     int64
	GrandTotal    int64
	LineItems     []LineItemResult
}

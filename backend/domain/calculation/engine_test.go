package calculation_test

import (
	"testing"

	"quotierlabs/backend/domain/calculation"
)

func TestEngine(t *testing.T) {
	engine := calculation.NewEngine()

	tests := []struct {
		name      string
		lines     []calculation.LineItemInput
		taxMode   calculation.TaxMode
		want      calculation.CalculationResult
	}{
		{
			name: "Basic tax-exclusive intra-state",
			lines: []calculation.LineItemInput{
				{QuantityFloat: 1, Rate: 10000, TaxRateFloat: 18.0, TaxInclusive: false}, // 100 INR
			},
			taxMode: calculation.TaxModeIntraState,
			want: calculation.CalculationResult{
				Subtotal:      10000,
				DiscountTotal: 0,
				TaxableTotal:  10000,
				CGSTTotal:     900,
				SGSTTotal:     900,
				IGSTTotal:     0,
				GrandTotal:    11800,
			},
		},
		{
			name: "Basic tax-exclusive inter-state",
			lines: []calculation.LineItemInput{
				{QuantityFloat: 1, Rate: 10000, TaxRateFloat: 18.0, TaxInclusive: false}, // 100 INR
			},
			taxMode: calculation.TaxModeInterState,
			want: calculation.CalculationResult{
				Subtotal:      10000,
				DiscountTotal: 0,
				TaxableTotal:  10000,
				CGSTTotal:     0,
				SGSTTotal:     0,
				IGSTTotal:     1800,
				GrandTotal:    11800,
			},
		},
		{
			name: "Discount before tax",
			lines: []calculation.LineItemInput{
				{QuantityFloat: 1, Rate: 10000, Discount: 1000, TaxRateFloat: 18.0, TaxInclusive: false},
			},
			taxMode: calculation.TaxModeIntraState,
			want: calculation.CalculationResult{
				Subtotal:      10000,
				DiscountTotal: 1000,
				TaxableTotal:  9000,
				CGSTTotal:     810,
				SGSTTotal:     810,
				IGSTTotal:     0,
				GrandTotal:    10600, // 9000 + 1620
			},
		},
		{
			name: "Tax-inclusive reverse calculation",
			lines: []calculation.LineItemInput{
				{QuantityFloat: 1, Rate: 11800, TaxRateFloat: 18.0, TaxInclusive: true},
			},
			taxMode: calculation.TaxModeIntraState,
			want: calculation.CalculationResult{
				Subtotal:      11800,
				DiscountTotal: 0,
				TaxableTotal:  10000,
				CGSTTotal:     900,
				SGSTTotal:     900,
				IGSTTotal:     0,
				GrandTotal:    11800, // 10000 + 1800
			},
		},
		{
			name: "Zero quantity",
			lines: []calculation.LineItemInput{
				{QuantityFloat: 0, Rate: 10000, TaxRateFloat: 18.0, TaxInclusive: false},
			},
			taxMode: calculation.TaxModeIntraState,
			want: calculation.CalculationResult{
				Subtotal: 0, TaxableTotal: 0, CGSTTotal: 0, SGSTTotal: 0, GrandTotal: 0,
			},
		},
		{
			name: "Zero tax rate",
			lines: []calculation.LineItemInput{
				{QuantityFloat: 2, Rate: 5000, TaxRateFloat: 0.0, TaxInclusive: false},
			},
			taxMode: calculation.TaxModeIntraState,
			want: calculation.CalculationResult{
				Subtotal: 10000, TaxableTotal: 10000, CGSTTotal: 0, SGSTTotal: 0, GrandTotal: 10000,
			},
		},
		{
			name: "Multiple lines with mixed tax rates and inclusiveness",
			lines: []calculation.LineItemInput{
				{QuantityFloat: 1, Rate: 10000, TaxRateFloat: 5.0, TaxInclusive: false},
				{QuantityFloat: 1, Rate: 11800, TaxRateFloat: 18.0, TaxInclusive: true},
			},
			taxMode: calculation.TaxModeIntraState,
			want: calculation.CalculationResult{
				Subtotal:      21800,
				TaxableTotal:  20000,
				CGSTTotal:     1150, // 250 + 900
				SGSTTotal:     1150, // 250 + 900
				IGSTTotal:     0,
				GrandTotal:    22300, // 20000 + 2300
			},
		},
		{
			name: "Rounding Fractional Paise to Rupee Grand Total",
			lines: []calculation.LineItemInput{
				{QuantityFloat: 1, Rate: 10050, TaxRateFloat: 18.0, TaxInclusive: false}, // 100.50
			},
			taxMode: calculation.TaxModeIntraState,
			// Taxable = 10050
			// Tax = 10050 * 18% = 1809 paise
			// CGST = 904.5 -> 905, SGST = 1809 - 905 = 904
			// Grand Total Base = 10050 + 1809 = 11859 paise (118.59 INR) -> Rounded to Rupee = 11900 paise (119.00 INR)
			want: calculation.CalculationResult{
				Subtotal:      10050,
				DiscountTotal: 0,
				TaxableTotal:  10050,
				CGSTTotal:     905,
				SGSTTotal:     904,
				IGSTTotal:     0,
				GrandTotal:    11900,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := engine.Calculate(tt.lines, tt.taxMode)
			
			if got.Subtotal != tt.want.Subtotal {
				t.Errorf("Subtotal: got %v, want %v", got.Subtotal, tt.want.Subtotal)
			}
			if got.TaxableTotal != tt.want.TaxableTotal {
				t.Errorf("TaxableTotal: got %v, want %v", got.TaxableTotal, tt.want.TaxableTotal)
			}
			if got.CGSTTotal != tt.want.CGSTTotal {
				t.Errorf("CGSTTotal: got %v, want %v", got.CGSTTotal, tt.want.CGSTTotal)
			}
			if got.SGSTTotal != tt.want.SGSTTotal {
				t.Errorf("SGSTTotal: got %v, want %v", got.SGSTTotal, tt.want.SGSTTotal)
			}
			if got.IGSTTotal != tt.want.IGSTTotal {
				t.Errorf("IGSTTotal: got %v, want %v", got.IGSTTotal, tt.want.IGSTTotal)
			}
			if got.GrandTotal != tt.want.GrandTotal {
				t.Errorf("GrandTotal: got %v, want %v", got.GrandTotal, tt.want.GrandTotal)
			}
		})
	}
}

import { describe, expect, it } from 'vitest'
import { calculateAdvisoryTotals } from './lineItemCalculation'

describe('V6 line-item advisory totals', () => {
  it('matches the Go rounding contract for discounts, mixed rates, and inclusive tax', () => {
    const result = calculateAdvisoryTotals([
      {
        id: 'a',
        description: 'Exclusive',
        quantity: 2,
        rate: 5000,
        discount: 1000,
        tax_rate: 5,
        tax_inclusive: false,
      },
      {
        id: 'b',
        description: 'Inclusive',
        quantity: 1,
        rate: 11800,
        discount: 0,
        tax_rate: 18,
        tax_inclusive: true,
      },
    ])
    expect(result).toMatchObject({ subtotal: 21800, discount: 1000, tax: 2250, grand: 21300 })
    expect(result.lines[1]).toEqual({ taxable: 10000, tax: 1800, amount: 11800 })
  })
})

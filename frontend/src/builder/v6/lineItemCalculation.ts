export type AdvisoryLineItem = {
  id: string
  description: string
  quantity: number
  rate: number
  discount: number
  tax_rate: number
  tax_inclusive: boolean
}

export function calculateAdvisoryTotals(rows: AdvisoryLineItem[]) {
  let subtotal = 0,
    discount = 0,
    tax = 0,
    grand = 0
  const lines = rows.map((row) => {
    const base = Math.round(row.quantity * row.rate)
    const discounted = Math.max(0, base - row.discount)
    const taxable = row.tax_inclusive
      ? Math.round(discounted / (1 + row.tax_rate / 100))
      : discounted
    const lineTax = row.tax_inclusive
      ? discounted - taxable
      : Math.round((taxable * row.tax_rate) / 100)
    subtotal += base
    discount += row.discount
    tax += lineTax
    grand += taxable + lineTax
    return { taxable, tax: lineTax, amount: taxable + lineTax }
  })
  return { subtotal, discount, tax, grand: Math.round(grand / 100) * 100, lines }
}

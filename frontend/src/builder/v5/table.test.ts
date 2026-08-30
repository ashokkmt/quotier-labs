import { describe, expect, it } from 'vitest'
import { createBlankTable, normalizeTableData, tableHeightDU } from './table'

describe('generic table model', () => {
  it('creates blank configurable tables without prefixed headers', () => {
    const table = createBlankTable(4, 5, 50000)
    expect(table.column_count).toBe(5)
    expect(table.rows).toHaveLength(4)
    expect(table.headers).toEqual(['', '', '', '', ''])
    expect(table.header_enabled).toBe(false)
    expect(table.rows.flat().every((cell) => cell === '')).toBe(true)
    expect(tableHeightDU(table)).toBeGreaterThan(0)
  })

  it('preserves legacy header intent while normalizing rectangular cells', () => {
    const table = normalizeTableData({ headers: ['Item', 'Amount'], rows: [['A']] })
    expect(table.header_enabled).toBe(true)
    expect(table.repeat_header).toBe(true)
    expect(table.rows).toEqual([['A', '']])
  })

  it('enforces supported row, column, and row-height bounds', () => {
    const table = createBlankTable(999, 99, 50000)
    expect(table.rows).toHaveLength(500)
    expect(table.column_count).toBe(12)
    expect(
      normalizeTableData({ headers: [''], rows: [['']], row_height_mm: 1 }).row_height_mm,
    ).toBe(5)
  })
})

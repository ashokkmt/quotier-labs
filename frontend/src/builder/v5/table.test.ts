import { describe, expect, it } from 'vitest'
import {
  createBlankTable,
  insertTableColumn,
  insertTableRow,
  normalizeTableData,
  removeTableColumn,
  removeTableRow,
  resolvedTableColumnWidths,
  tableCellAtPoint,
  tableHeightDU,
  DU_PER_MM,
} from './table'

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

describe('indexed table structure', () => {
  it('inserts and removes at the active row and column', () => {
    const table = normalizeTableData({
      headers: ['A', 'B'],
      rows: [
        ['one', 'two'],
        ['three', 'four'],
      ],
      column_count: 2,
      column_widths: [5000, 6000],
    })
    expect(insertTableRow(table, 1).rows).toEqual([
      ['one', 'two'],
      ['', ''],
      ['three', 'four'],
    ])
    expect(removeTableRow(table, 0).rows).toEqual([['three', 'four']])
    expect(insertTableColumn(table, 1).rows[0]).toEqual(['one', '', 'two'])
    expect(removeTableColumn(table, 0).rows[0]).toEqual(['two'])
  })

  it('maps an object-mode pointer to the exact header or body cell', () => {
    const table = createBlankTable(2, 2, 32000)
    table.header_enabled = true
    expect(tableCellAtPoint(table, 100, 100)).toEqual({ row: -1, column: 0 })
    expect(tableCellAtPoint(table, 20000, table.row_height_mm * DU_PER_MM + 100)).toEqual({
      row: 0,
      column: 1,
    })
  })

  it('projects all columns into the current frame without changing their ratios', () => {
    const table = createBlankTable(2, 3, 30000)
    table.column_widths = [10000, 20000, 30000]
    expect(resolvedTableColumnWidths(table, 30000)).toEqual([5000, 10000, 15000])
    expect(tableCellAtPoint(table, 16000, 100, 30000).column).toBe(2)
  })
})

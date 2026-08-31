import { du } from './model'

export const TABLE_MIN_ROWS = 1
export const TABLE_MAX_ROWS = 500
export const TABLE_MIN_COLUMNS = 1
export const TABLE_MAX_COLUMNS = 12
export const TABLE_DEFAULT_ROW_HEIGHT_MM = 8
export const TABLE_MIN_ROW_HEIGHT_MM = 5
export const TABLE_MIN_COLUMN_WIDTH_MM = 15
export const DU_PER_MM = (72 / 25.4) * 100

export type V5TableData = {
  headers: string[]
  rows: string[][]
  column_count: number
  header_enabled: boolean
  repeat_header: boolean
  row_height_mm: number
  column_widths: number[]
  line_items?: Array<{
    id?: string
    quantity: number
    rate: number
    discount: number
    tax_rate: number
    tax_inclusive: boolean
  }>
}

export function createBlankTable(rows: number, columns: number, widthDU: number): V5TableData {
  const rowCount = clampInt(rows, TABLE_MIN_ROWS, TABLE_MAX_ROWS)
  const columnCount = clampInt(columns, TABLE_MIN_COLUMNS, TABLE_MAX_COLUMNS)
  const width = Math.max(du(TABLE_MIN_COLUMN_WIDTH_MM * DU_PER_MM), du(widthDU / columnCount))
  return {
    headers: Array.from({ length: columnCount }, () => ''),
    rows: Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => '')),
    column_count: columnCount,
    header_enabled: false,
    repeat_header: false,
    row_height_mm: TABLE_DEFAULT_ROW_HEIGHT_MM,
    column_widths: Array.from({ length: columnCount }, () => width),
  }
}

/** Legacy stories lacked structural fields. Preserve their headers while normalizing safely. */
export function normalizeTableData(content: unknown): V5TableData {
  const value = (content ?? {}) as Partial<V5TableData>
  const rows = Array.isArray(value.rows)
    ? value.rows.map((row) => (Array.isArray(row) ? row.map(String) : []))
    : []
  const headers = Array.isArray(value.headers) ? value.headers.map(String) : []
  const inferred = Math.max(1, headers.length, ...rows.map((row) => row.length))
  const columns = clampInt(Number(value.column_count ?? inferred), 1, TABLE_MAX_COLUMNS)
  const normalizeRow = (row: string[]) =>
    Array.from({ length: columns }, (_, index) => row[index] ?? '')
  const widths = Array.isArray(value.column_widths) ? value.column_widths.map(Number) : []
  const minimumColumnWidth = du(TABLE_MIN_COLUMN_WIDTH_MM * DU_PER_MM)
  return {
    headers: normalizeRow(headers),
    rows: (rows.length ? rows : [Array.from({ length: columns }, () => '')]).map(normalizeRow),
    column_count: columns,
    // Missing means legacy: headers were always rendered and must not disappear on migration.
    header_enabled:
      value.header_enabled === undefined ? headers.length > 0 : !!value.header_enabled,
    repeat_header: value.repeat_header === undefined ? headers.length > 0 : !!value.repeat_header,
    row_height_mm: Math.max(
      TABLE_MIN_ROW_HEIGHT_MM,
      Number(value.row_height_mm ?? TABLE_DEFAULT_ROW_HEIGHT_MM),
    ),
    column_widths: Array.from({ length: columns }, (_, index) =>
      Number.isFinite(widths[index]) && widths[index] > 0
        ? Math.max(minimumColumnWidth, du(widths[index]))
        : 0,
    ),
    line_items: Array.isArray(value.line_items)
      ? value.line_items.map((item) => ({
          id: item.id,
          quantity: Number(item.quantity),
          rate: Number(item.rate),
          discount: Number(item.discount),
          tax_rate: Number(item.tax_rate),
          tax_inclusive: Boolean(item.tax_inclusive),
        }))
      : undefined,
  }
}

export const tableHeightDU = (table: V5TableData) =>
  Math.ceil((table.rows.length + (table.header_enabled ? 1 : 0)) * table.row_height_mm * DU_PER_MM)

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value) || min))
}

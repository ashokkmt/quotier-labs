import { du } from './model'

export const TABLE_MIN_ROWS = 1
export const TABLE_MAX_ROWS = 500
export const TABLE_MIN_COLUMNS = 1
export const TABLE_MAX_COLUMNS = 12
export const TABLE_DEFAULT_ROW_HEIGHT_MM = 8
export const TABLE_MIN_ROW_HEIGHT_MM = 5
export const TABLE_MIN_COLUMN_WIDTH_MM = 15
export const DU_PER_MM = (72 / 25.4) * 100
export const TABLE_FONT_SIZE_PT = 8
export const TABLE_CELL_PADDING_X_PT = 3
export const TABLE_CELL_PADDING_Y_PT = 2
export const TABLE_BORDER_WIDTH_PT = 0.5
export const TABLE_TEXT_COLOR = '#111827'
export const TABLE_BORDER_COLOR = '#4B5563'
export const TABLE_HEADER_FILL = '#F3F4F6'
export const TABLE_BODY_FILL = '#FFFFFF'

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

/** Projects authored column ratios into the current frame width. LayoutIR/PDF applies this same
 * rule, so legacy or constrained frames never clip columns only in the editor. */
export function resolvedTableColumnWidths(table: V5TableData, frameWidthDU: number): number[] {
  const normalized = normalizeTableData(table)
  const total = normalized.column_widths.reduce(
    (sum, width) => sum + (Number.isFinite(width) && width > 0 ? width : 0),
    0,
  )
  if (total <= 0)
    return Array.from(
      { length: normalized.column_count },
      () => frameWidthDU / normalized.column_count,
    )
  return normalized.column_widths.map((width) => (width / total) * frameWidthDU)
}

/** Resolves an object-mode pointer to the exact editable cell without adding DOM-only data. */
export function tableCellAtPoint(
  table: V5TableData,
  xDU: number,
  yDU: number,
  frameWidthDU?: number,
): { row: number; column: number } {
  const normalized = normalizeTableData(table)
  const projectedWidths = resolvedTableColumnWidths(
    normalized,
    frameWidthDU ?? normalized.column_widths.reduce((sum, width) => sum + width, 0),
  )
  const totalWidth = projectedWidths.reduce((sum, width) => sum + width, 0)
  const fallbackWidth = totalWidth > 0 ? totalWidth / normalized.column_count : 1
  let edge = 0
  let column = normalized.column_count - 1
  for (let index = 0; index < normalized.column_count; index++) {
    edge += projectedWidths[index] || fallbackWidth
    if (xDU < edge) {
      column = index
      break
    }
  }
  const rowHeight = normalized.row_height_mm * DU_PER_MM
  const visualRow = Math.max(
    0,
    Math.min(
      normalized.rows.length + (normalized.header_enabled ? 1 : 0) - 1,
      Math.floor(yDU / Math.max(1, rowHeight)),
    ),
  )
  return {
    row: normalized.header_enabled ? visualRow - 1 : visualRow,
    column,
  }
}

export function insertTableRow(table: V5TableData, index: number): V5TableData {
  const next = normalizeTableData(table)
  if (next.rows.length >= TABLE_MAX_ROWS) return next
  const at = Math.max(0, Math.min(index, next.rows.length))
  next.rows.splice(
    at,
    0,
    Array.from({ length: next.column_count }, () => ''),
  )
  return next
}

export function removeTableRow(table: V5TableData, index: number): V5TableData {
  const next = normalizeTableData(table)
  if (next.rows.length <= TABLE_MIN_ROWS) return next
  const at = Math.max(0, Math.min(index, next.rows.length - 1))
  next.rows.splice(at, 1)
  return next
}

export function insertTableColumn(table: V5TableData, index: number): V5TableData {
  const next = normalizeTableData(table)
  if (next.column_count >= TABLE_MAX_COLUMNS) return next
  const at = Math.max(0, Math.min(index, next.column_count))
  const fallback =
    next.column_widths.find((width) => width > 0) ?? du(TABLE_MIN_COLUMN_WIDTH_MM * DU_PER_MM)
  next.column_count += 1
  next.headers.splice(at, 0, '')
  next.rows.forEach((row) => row.splice(at, 0, ''))
  next.column_widths.splice(at, 0, fallback)
  return next
}

export function removeTableColumn(table: V5TableData, index: number): V5TableData {
  const next = normalizeTableData(table)
  if (next.column_count <= TABLE_MIN_COLUMNS) return next
  const at = Math.max(0, Math.min(index, next.column_count - 1))
  next.column_count -= 1
  next.headers.splice(at, 1)
  next.rows.forEach((row) => row.splice(at, 1))
  next.column_widths.splice(at, 1)
  return next
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value) || min))
}

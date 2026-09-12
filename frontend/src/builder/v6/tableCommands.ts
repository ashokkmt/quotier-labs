import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { clampV6RowMinHeight } from './model'

export type TableTarget = {
  tablePos: number
  cellPos: number
  row: number
  column: number
  rows: number
  columns: number
}

export function tableTargetAt(
  editor: Editor,
  position = editor.state.selection.from,
): TableTarget | null {
  const safePosition = Math.max(0, Math.min(position, editor.state.doc.content.size))
  const resolved = editor.state.doc.resolve(safePosition)
  let cellDepth = -1
  for (let depth = resolved.depth; depth > 0; depth--) {
    if (['tableCell', 'tableHeader'].includes(resolved.node(depth).type.name)) {
      cellDepth = depth
      break
    }
  }
  if (cellDepth < 2 || resolved.node(cellDepth - 2).type.name !== 'table') return null
  const table = resolved.node(cellDepth - 2)
  const tablePos = resolved.before(cellDepth - 2)
  const cellPos = resolved.before(cellDepth)
  const map = TableMap.get(table)
  const rect = map.findCell(cellPos - tablePos - 1)
  return {
    tablePos,
    cellPos,
    row: rect.top,
    column: rect.left,
    rows: map.height,
    columns: map.width,
  }
}

export function selectTableRow(editor: Editor, target: TableTarget) {
  return selectCells(editor, target, target.row, 0, target.row, target.columns - 1)
}

export function selectTableColumn(editor: Editor, target: TableTarget) {
  return selectCells(editor, target, 0, target.column, target.rows - 1, target.column)
}

function selectCells(
  editor: Editor,
  target: TableTarget,
  anchorRow: number,
  anchorColumn: number,
  headRow: number,
  headColumn: number,
) {
  const table = editor.state.doc.nodeAt(target.tablePos)
  if (!table || table.type.name !== 'table') return false
  const map = TableMap.get(table)
  if (anchorRow < 0 || anchorColumn < 0 || headRow >= map.height || headColumn >= map.width)
    return false
  const start = target.tablePos + 1
  const selection = CellSelection.create(
    editor.state.doc,
    start + map.positionAt(anchorRow, anchorColumn, table),
    start + map.positionAt(headRow, headColumn, table),
  )
  editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
  return true
}

export function moveTableRow(editor: Editor, target: TableTarget, direction: -1 | 1) {
  const destination = target.row + direction
  const table = validRectangularTable(editor, target)
  if (!table || destination < 0 || destination >= table.childCount) return false
  const rows = children(table)
  ;[rows[target.row], rows[destination]] = [rows[destination], rows[target.row]]
  return replaceTable(editor, target, table, rows, destination, target.column)
}

export function moveTableColumn(editor: Editor, target: TableTarget, direction: -1 | 1) {
  const destination = target.column + direction
  const table = validRectangularTable(editor, target)
  if (!table || destination < 0 || destination >= target.columns) return false
  const rows = children(table).map((row) => {
    const cells = children(row)
    ;[cells[target.column], cells[destination]] = [cells[destination], cells[target.column]]
    return row.type.create(row.attrs, Fragment.fromArray(cells), row.marks)
  })
  const widths = physicalColumnWidths(table)
  ;[widths[target.column], widths[destination]] = [widths[destination], widths[target.column]]
  return replaceTable(editor, target, table, rows, target.row, destination, {
    ...table.attrs,
    column_widths: widths,
  })
}

export function setTableRowMinHeight(editor: Editor, target: TableTarget, value: number) {
  const table = validRectangularTable(editor, target)
  if (!table) return false
  let rowPos = target.tablePos + 1
  for (let index = 0; index < target.row; index++) rowPos += table.child(index).nodeSize
  const row = table.child(target.row)
  editor.view.dispatch(
    editor.state.tr
      .setNodeMarkup(rowPos, undefined, {
        ...row.attrs,
        min_height: clampV6RowMinHeight(value),
      })
      .scrollIntoView(),
  )
  return true
}

function validRectangularTable(editor: Editor, target: TableTarget) {
  const table = editor.state.doc.nodeAt(target.tablePos)
  if (!table || table.type.name !== 'table' || target.row < 0 || target.column < 0) return null
  const columns = table.firstChild?.childCount ?? 0
  if (!columns || target.row >= table.childCount || target.column >= columns) return null
  for (let row = 0; row < table.childCount; row++) {
    if (table.child(row).type.name !== 'tableRow' || table.child(row).childCount !== columns)
      return null
  }
  return table
}

function replaceTable(
  editor: Editor,
  target: TableTarget,
  table: ProseMirrorNode,
  rows: ProseMirrorNode[],
  selectedRow: number,
  selectedColumn: number,
  attrs = table.attrs,
) {
  const next = table.type.create(attrs, Fragment.fromArray(rows), table.marks)
  const tr = editor.state.tr
    .replaceWith(target.tablePos, target.tablePos + table.nodeSize, next)
    .setMeta('addToHistory', true)
  const map = TableMap.get(next)
  const cellPos = target.tablePos + 1 + map.positionAt(selectedRow, selectedColumn, next)
  tr.setSelection(TextSelection.near(tr.doc.resolve(cellPos + 1))).scrollIntoView()
  editor.view.dispatch(tr)
  return true
}

function physicalColumnWidths(table: ProseMirrorNode) {
  const stored = Array.isArray(table.attrs.column_widths) ? [...table.attrs.column_widths] : []
  return Array.from({ length: table.firstChild?.childCount ?? 0 }, (_, index) => {
    const colwidth = table.firstChild?.child(index).attrs.colwidth
    const pixels = Array.isArray(colwidth) ? Number(colwidth[0]) : 0
    return pixels > 0 ? Math.round(pixels * 75) : Number(stored[index] || 15000)
  })
}

function children(node: ProseMirrorNode) {
  const result: ProseMirrorNode[] = []
  node.forEach((child) => result.push(child))
  return result
}

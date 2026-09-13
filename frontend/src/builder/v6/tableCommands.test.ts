import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { v6Extensions } from './extensions'
import {
  moveTableColumn,
  moveTableRow,
  selectTableRow,
  selectWholeTable,
  setTableRowMinHeight,
  tableTargetAt,
} from './tableCommands'
import { NodeSelection } from '@tiptap/pm/state'

let editor: Editor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
})

const cell = (id: string, text: string, width: number) => ({
  type: 'tableCell',
  attrs: { colspan: 1, rowspan: 1, colwidth: [width], background: 'transparent' },
  content: [{ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] }],
})

function createEditor() {
  editor = new Editor({
    extensions: v6Extensions,
    content: {
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: { id: 'table', column_widths: [7500, 15000] },
          content: [
            { type: 'tableRow', content: [cell('a', 'A', 100), cell('b', 'B', 200)] },
            { type: 'tableRow', content: [cell('c', 'C', 100), cell('d', 'D', 200)] },
          ],
        },
      ],
    },
  })
  const positions: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell') positions.push(pos)
  })
  editor.commands.setTextSelection(positions[0] + 2)
  return { editor, positions }
}

describe('V6 table commands', () => {
  it('moves complete rows atomically', () => {
    const { editor } = createEditor()
    const target = tableTargetAt(editor)!
    expect(moveTableRow(editor, target, 1)).toBe(true)
    const json: any = editor.getJSON()
    expect(json.content[0].content[0].content[0].content[0].content[0].text).toBe('C')
  })

  it('moves columns together with their physical widths', () => {
    const { editor } = createEditor()
    const target = tableTargetAt(editor)!
    expect(moveTableColumn(editor, target, 1)).toBe(true)
    const table: any = editor.getJSON().content?.[0]
    expect(table.attrs.column_widths).toEqual([15000, 7500])
    expect(table.content.map((row: any) => row.content[0].content[0].content[0].text)).toEqual([
      'B',
      'D',
    ])
  })

  it('stores a bounded minimum row height', () => {
    const { editor } = createEditor()
    const target = tableTargetAt(editor)!
    expect(setTableRowMinHeight(editor, target, 1200)).toBe(true)
    let json: any = editor.getJSON()
    expect(json.content[0].content[0].attrs.min_height).toBe(2400)
    expect(setTableRowMinHeight(editor, tableTargetAt(editor)!, 999999)).toBe(true)
    json = editor.getJSON()
    expect(json.content[0].content[0].attrs.min_height).toBe(84189)
  })

  it('gives every inserted column an independent physical width', () => {
    editor = new Editor({
      extensions: v6Extensions,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    editor.commands.insertTable({ rows: 2, cols: 3, withHeaderRow: true })
    const table: any = editor.getJSON().content?.find((node: any) => node.type === 'table')
    expect(
      table.content.flatMap((row: any) => row.content.map((item: any) => item.attrs.colwidth)),
    ).toEqual(Array(6).fill([200]))
  })

  it('selects, merges, splits, and selects the complete table with framework primitives', () => {
    const { editor } = createEditor()
    let target = tableTargetAt(editor)!
    expect(selectTableRow(editor, target)).toBe(true)
    expect(editor.commands.mergeCells()).toBe(true)
    const mergedTable: any = editor.getJSON().content?.[0]
    expect(mergedTable.content[0].content[0].attrs.colspan).toBe(2)
    editor.commands.setTextSelection(target.tablePos + 3)
    expect(editor.commands.splitCell()).toBe(true)
    target = tableTargetAt(editor)!
    expect(selectWholeTable(editor, target)).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
  })

  it('registers undo/redo while handling edge insertion and deletion', () => {
    const { editor } = createEditor()
    expect(editor.commands.addRowBefore()).toBe(true)
    expect(editor.commands.addColumnBefore()).toBe(true)
    let table: any = editor.getJSON().content?.[0]
    expect(table.content).toHaveLength(3)
    expect(table.content[0].content).toHaveLength(3)
    expect(editor.extensionManager.extensions.map((extension) => extension.name)).toContain(
      'undoRedo',
    )
    expect(editor.commands.deleteRow()).toBe(true)
    expect(editor.commands.deleteColumn()).toBe(true)
    table = editor.getJSON().content?.[0]
    expect(table.content).toHaveLength(2)
    expect(table.content[0].content).toHaveLength(2)
  })
})

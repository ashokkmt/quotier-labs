import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { v6Extensions } from './extensions'
import { moveTableColumn, moveTableRow, setTableRowMinHeight, tableTargetAt } from './tableCommands'

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
})

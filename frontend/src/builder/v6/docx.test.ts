import { describe, expect, it } from 'vitest'
import { createBlankV6Document } from './model'
import { generateV6Docx } from './docx'

describe('V6 DOCX export', () => {
  it('creates an OOXML ZIP with marked text, a table, and a page break', async () => {
    const document = createBlankV6Document()
    document.body.content![0].content = [
      { type: 'text', text: 'Quotation', marks: [{ type: 'bold' }] },
    ]
    const cell = (id: string, text: string) => ({
      type: 'tableCell',
      attrs: { colspan: 1, rowspan: 1, background: 'transparent' },
      content: [{ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] }],
    })
    document.body.content!.push(
      {
        type: 'table',
        attrs: { id: 'table', column_widths: [20000, 20000] },
        content: [{ type: 'tableRow', content: [cell('cell-a', 'A'), cell('cell-b', 'B')] }],
      },
      { type: 'pageBreak', attrs: { id: 'break' } },
    )
    const output = new Uint8Array(await generateV6Docx(document))
    expect(String.fromCharCode(...output.slice(0, 2))).toBe('PK')
    expect(output.byteLength).toBeGreaterThan(1000)
    expect(new TextDecoder().decode(output)).toContain('word/document.xml')
    expect(new TextDecoder().decode(output)).toContain('[Content_Types].xml')
  })
})

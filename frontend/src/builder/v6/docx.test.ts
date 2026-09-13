import { describe, expect, it } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { createBlankV6Document } from './model'
import { generateV6Docx } from './docx'

describe('V6 DOCX export', () => {
  it('creates an OOXML ZIP with marked text, a table, and a page break', async () => {
    const document = createBlankV6Document()
    document.body.content![0].content = [
      {
        type: 'text',
        text: 'Quotation',
        marks: [
          { type: 'bold' },
          { type: 'strike' },
          { type: 'link', attrs: { href: 'https://quotier.example' } },
        ],
      },
      { type: 'text', text: ' for ' },
      {
        type: 'field',
        attrs: { id: 'customer-field', key: 'customer.name', empty_behavior: 'diagnostic' },
      },
    ]
    const cell = (id: string, text: string, attrs = {}, type = 'tableCell') => ({
      type,
      attrs: { colspan: 1, rowspan: 1, background: 'transparent', ...attrs },
      content: [{ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] }],
    })
    document.body.content!.push(
      {
        type: 'table',
        attrs: { id: 'table', column_widths: [13000, 13000] },
        content: [
          {
            type: 'tableRow',
            attrs: { min_height: 2400 },
            content: [cell('heading', 'Heading', { colspan: 2 }, 'tableHeader')],
          },
          {
            type: 'tableRow',
            content: [
              cell('cell-a', 'A', { rowspan: 2 }),
              {
                type: 'tableCell',
                attrs: { colspan: 1, rowspan: 1 },
                content: [
                  {
                    type: 'bulletList',
                    attrs: { id: 'cell-list' },
                    content: [
                      {
                        type: 'listItem',
                        attrs: { id: 'cell-item' },
                        content: [
                          {
                            type: 'paragraph',
                            attrs: { id: 'cell-list-paragraph' },
                            content: [{ type: 'text', text: 'Cell term' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { type: 'tableRow', content: [cell('cell-b', 'B')] },
        ],
      },
      { type: 'pageBreak', attrs: { id: 'break' } },
      {
        type: 'bulletList',
        attrs: { id: 'list' },
        content: [
          {
            type: 'listItem',
            attrs: { id: 'item' },
            content: [
              {
                type: 'paragraph',
                attrs: { id: 'list-paragraph', style: 'Terms' },
                content: [{ type: 'text', text: 'Term' }],
              },
            ],
          },
        ],
      },
    )
    document.settings.different_first_page = true
    document.header_story = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'header' },
          content: [{ type: 'pageNumber' }, { type: 'text', text: '/' }, { type: 'pageCount' }],
        },
      ],
    }
    document.footer_story = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'footer' }, content: [{ type: 'text', text: 'Footer' }] },
      ],
    }
    document.first_page_header_story = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'first-header' },
          content: [{ type: 'text', text: 'First' }],
        },
      ],
    }
    const output = new Uint8Array(await generateV6Docx(document, { 'customer.name': 'A & B' }))
    expect(String.fromCharCode(...output.slice(0, 2))).toBe('PK')
    expect(output.byteLength).toBeGreaterThan(1000)
    expect(new TextDecoder().decode(output)).toContain('word/document.xml')
    expect(new TextDecoder().decode(output)).toContain('[Content_Types].xml')
    expect(new TextDecoder().decode(output)).toContain('word/styles.xml')
    expect(new TextDecoder().decode(output)).toContain('word/numbering.xml')
    expect(new TextDecoder().decode(output)).toContain('word/header1.xml')
    expect(new TextDecoder().decode(output)).toContain('word/footer1.xml')
    const xml = unzipText(output)
    expect(xml['word/document.xml']).toContain('w:numPr')
    expect(xml['word/document.xml']).toContain('w:hyperlink')
    expect(xml['word/document.xml']).toContain('w:strike')
    expect(xml['word/document.xml']).toContain('w:hRule="atLeast"')
    expect(xml['word/document.xml']).toContain('w:tblHeader')
    expect(xml['word/document.xml']).toContain('w:gridSpan')
    expect(xml['word/document.xml']).toContain('w:vMerge')
    expect(xml['word/document.xml']).toContain('Cell term')
    expect(xml['word/document.xml']).toContain('A &amp; B')
    expect(xml['word/document.xml']).toContain('w:val="480"')
    expect(xml['word/styles.xml']).toContain('QuotierTerms')
    expect(xml['word/header1.xml']).toContain('PAGE')
    expect(xml['word/header1.xml']).toContain('NUMPAGES')
    expect(Object.values(xml).filter((value) => value.includes('Footer'))).toHaveLength(2)
    expect(xml['word/_rels/document.xml.rels']).toContain('https://quotier.example')
  })
})

function unzipText(zip: Uint8Array): Record<string, string> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let end = zip.length - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0) throw new Error('ZIP end record is missing')
  let position = view.getUint32(end + 16, true)
  const files: Record<string, string> = {}
  while (view.getUint32(position, true) === 0x02014b50) {
    const method = view.getUint16(position + 10, true)
    const size = view.getUint32(position + 20, true)
    const nameLength = view.getUint16(position + 28, true)
    const extraLength = view.getUint16(position + 30, true)
    const commentLength = view.getUint16(position + 32, true)
    const local = view.getUint32(position + 42, true)
    const name = new TextDecoder().decode(zip.subarray(position + 46, position + 46 + nameLength))
    const localNameLength = view.getUint16(local + 26, true)
    const localExtraLength = view.getUint16(local + 28, true)
    const data = zip.subarray(
      local + 30 + localNameLength + localExtraLength,
      local + 30 + localNameLength + localExtraLength + size,
    )
    files[name] =
      method === 8 ? inflateRawSync(data).toString('utf8') : new TextDecoder().decode(data)
    position += 46 + nameLength + extraLength + commentLength
  }
  return files
}

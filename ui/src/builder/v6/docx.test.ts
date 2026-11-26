import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { createBlankV6Document } from './model'
import { GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'
import { generateV6Docx, generateV6DocxPackage } from './docx'

vi.mock('../../../wailsjs/go/wails/CompanyHandler', () => ({
  GetImageDataURI: vi.fn(
    async () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  ),
}))

beforeEach(() => vi.mocked(GetImageDataURI).mockClear())

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
    document.body.content![0].attrs = {
      ...document.body.content![0].attrs,
      keep_with_next: true,
      keep_together: true,
      widow_orphans: 2,
    }
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
    expect(xml['word/document.xml']).toContain('w:tblLayout w:type="fixed"')
    expect(xml['word/document.xml']).toContain('w:keepNext')
    expect(xml['word/document.xml']).toContain('w:keepLines')
    expect(xml['word/document.xml']).toContain('w:widowControl')
    expect(xml['word/document.xml']).toContain('w:gridSpan')
    expect(xml['word/document.xml']).toContain('w:vMerge')
    expect(xml['word/document.xml']).toContain('Cell term')
    expect(xml['word/document.xml']).toContain('A &amp; B')
    expect(xml['word/document.xml']).toContain('w:val="480"')
    expect(xml['word/styles.xml']).toContain('QuotierTerms')
    expect(xml['word/styles.xml']).toContain('w:ascii="Arial"')
    expect(xml['word/header1.xml']).toContain('PAGE')
    expect(xml['word/header1.xml']).toContain('NUMPAGES')
    expect(xml['word/settings.xml']).toContain('w:updateFields')
    expect(Object.values(xml).filter((value) => value.includes('Footer'))).toHaveLength(2)
    expect(xml['word/_rels/document.xml.rels']).toContain('https://quotier.example')
  })
})

it('uses authoritative totals, separate numbering, image deduplication, and actionable warnings', async () => {
  const document = createBlankV6Document()
  document.body.content = [
    {
      type: 'paragraph',
      attrs: { id: 'warning-paragraph' },
      content: [
        {
          type: 'field',
          attrs: { id: 'missing', key: 'customer.email', empty_behavior: 'diagnostic' },
        },
        {
          type: 'text',
          text: 'unsafe',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        },
      ],
    },
    ...['one', 'two'].map((id) => ({
      type: 'orderedList',
      attrs: { id },
      content: [
        {
          type: 'listItem',
          attrs: { id: `${id}-item` },
          content: [
            { type: 'paragraph', attrs: { id: `${id}-p` }, content: [{ type: 'text', text: id }] },
          ],
        },
      ],
    })),
    {
      type: 'lineItemTable',
      attrs: {
        id: 'items',
        rows: [
          { id: 'line', description: 'Service', quantity: 1, rate: 100, discount: 0, tax_rate: 0 },
        ],
        show_grand_total: true,
      },
    },
    ...['image-a', 'image-b'].map((id) => ({
      type: 'imageBlock',
      attrs: {
        id,
        source: 'asset:same.png',
        width: 7500,
        height: 7500,
        pixel_width: 1,
        pixel_height: 1,
        alt: 'Logo',
      },
    })),
  ]
  const result = await generateV6DocxPackage(document, {
    'quotation.grand_total': '₹999.99',
    'line_item.line.amount': '₹888.88',
  })
  const xml = unzipText(new Uint8Array(result.buffer))

  expect(xml['word/document.xml']).toContain('₹999.99')
  expect(xml['word/document.xml']).toContain('₹888.88')
  expect(xml['word/document.xml']).toContain('descr="Logo"')
  expect(xml['word/numbering.xml'].match(/w:abstractNumId="[23]"/g)).toHaveLength(2)
  expect(xml['word/document.xml']).toContain('w:numId w:val="2"')
  expect(xml['word/document.xml']).toContain('w:numId w:val="3"')
  expect(result.warnings.map((warning) => warning.code)).toEqual(['missing_field', 'unsafe_link'])
  expect(GetImageDataURI).toHaveBeenCalledTimes(1)
})

it('honors cancellation before DOCX projection starts', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    generateV6DocxPackage(createBlankV6Document(), {}, controller.signal),
  ).rejects.toThrow()
})

it('exports the supported 500-row line-item ceiling within the Phase 5 budget', async () => {
  const document = createBlankV6Document()
  document.body.content = [
    {
      type: 'lineItemTable',
      attrs: {
        id: 'large-items',
        rows: Array.from({ length: 500 }, (_, index) => ({
          id: `line-${index}`,
          description: `Service ${index}`,
          quantity: 1,
          rate: 10000,
          discount: 0,
          tax_rate: 18,
        })),
        show_grand_total: true,
      },
    },
  ]
  const started = performance.now()
  const output = await generateV6Docx(document)

  expect(output.byteLength).toBeGreaterThan(10_000)
  expect(performance.now() - started).toBeLessThan(10_000)
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

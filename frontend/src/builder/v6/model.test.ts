import { describe, expect, it } from 'vitest'
import {
  clampV6Indent,
  clampV6RowMinHeight,
  createBlankV6Document,
  normalizeV6Body,
  normalizeV6Story,
  usedColorsForV6,
} from './model'

describe('V6 document model', () => {
  it('adds controlled Phase 2 starter styles and stories', () => {
    const document = createBlankV6Document()
    expect(document.styles?.map((style) => style.name)).toHaveLength(9)
    expect(document.header_story?.type).toBe('doc')
    expect(document.footer_story?.type).toBe('doc')
    expect(clampV6Indent(-1)).toBe(0)
    expect(clampV6Indent(20000)).toBe(14400)
    expect(clampV6RowMinHeight(1)).toBe(2400)
    expect(clampV6RowMinHeight(999999)).toBe(84189)
    expect(
      normalizeV6Story({
        type: 'doc',
        content: [
          { type: 'imageBlock', attrs: { id: 'unsupported-in-story' } },
          { type: 'paragraph', attrs: { id: 'safe' }, content: [{ type: 'text', text: 'Header' }] },
        ],
      }).content,
    ).toEqual([
      { type: 'paragraph', attrs: { id: 'safe' }, content: [{ type: 'text', text: 'Header' }] },
    ])
    const story = normalizeV6Story({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'same' } },
        { type: 'paragraph', attrs: { id: 'same' } },
      ],
    })
    expect(new Set(story.content?.map((node) => node.attrs?.id)).size).toBe(2)
  })
  it('preserves marks only on the selected text run', () => {
    const document = createBlankV6Document()
    document.body.content![0].content = [
      { type: 'text', text: 'before ' },
      {
        type: 'text',
        text: 'important',
        marks: [
          { type: 'bold' },
          {
            type: 'textStyle',
            attrs: { fontFamily: 'Quotier Sans', fontSize: 1200, color: '#112233' },
          },
        ],
      },
      { type: 'text', text: ' after' },
    ]
    const roundTrip = JSON.parse(JSON.stringify(document))
    expect(roundTrip.body.content[0].content[0].marks).toBeUndefined()
    expect(roundTrip.body.content[0].content[1].marks).toHaveLength(2)
    expect(roundTrip.body.content[0].content[2].marks).toBeUndefined()
    expect(usedColorsForV6(document)).toEqual(['#112233'])
  })

  it('derives persisted physical column widths from resized cells', () => {
    const body = normalizeV6Body({
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: { id: 't' },
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colwidth: [200] } },
                { type: 'tableCell', attrs: { colwidth: [300] } },
              ],
            },
          ],
        },
      ],
    })
    expect(body.content?.[0].attrs?.column_widths).toEqual([15000, 22500])
  })

  it('strips Tiptap-only table attributes before autosave', () => {
    const body = normalizeV6Body({
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: { id: 'table', unexpected: true },
          content: [
            {
              type: 'tableRow',
              attrs: { unexpected: true },
              content: [
                {
                  type: 'tableCell',
                  attrs: { unexpected: true },
                  content: [{ type: 'paragraph', attrs: { id: 'cell' } }],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(body.content?.[0].content?.[0].attrs).toEqual({ min_height: 0, keep_together: false })
    expect(body.content?.[0].content?.[0].content?.[0].attrs).not.toHaveProperty('unexpected')
  })

  it('preserves controlled table row minimum heights', () => {
    const body = normalizeV6Body({
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: { id: 't', column_widths: [15000] },
          content: [
            {
              type: 'tableRow',
              attrs: { min_height: 4200 },
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', attrs: { id: 'p' } }] },
              ],
            },
          ],
        },
      ],
    })
    expect(body.content?.[0].content?.[0].attrs?.min_height).toBe(4200)
  })

  it('normalizes merged column widths and repeated header rows', () => {
    const body = normalizeV6Body({
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: { id: 'merged' },
          content: [
            {
              type: 'tableRow',
              content: [{ type: 'tableHeader', attrs: { colspan: 2, colwidth: [120, 180] } }],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, colwidth: [120] } },
                { type: 'tableCell', attrs: { colspan: 1, colwidth: [180] } },
              ],
            },
          ],
        },
      ],
    })
    expect(body.content?.[0].attrs).toMatchObject({
      column_widths: [9000, 13500],
      width: 22500,
      header_rows: 1,
      border_preset: 'all',
      cell_padding: 425,
    })
  })
})

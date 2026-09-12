import { describe, expect, it } from 'vitest'
import { createBlankV6Document, normalizeV6Body, usedColorsForV6 } from './model'

describe('V6 document model', () => {
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
})

import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import { hexToHSV, hsvToHex, usedColorsForDocument } from './color'
import { du } from './model'

const shape = (id: string, fill: string, stroke = 'none') => ({
  id,
  kind: 'shape',
  role: 'element' as const,
  geometry: { x: 0, y: 0, width: du(100), height: du(50), rotation: 0 },
  layout_mode: 'fixed' as const,
  locked: false,
  visibility: 'shown' as const,
  optional: false,
  props: { variant: 'rect', fill, stroke, strokeStyle: 'solid', strokeWidth: 1 },
})

describe('V5 color picker', () => {
  it('round-trips palette colors through HSV', () => {
    expect(hsvToHex(hexToHSV('#2F6FED'))).toBe('#2F6FED')
    expect(hsvToHex(hexToHSV('#FFFFFF'))).toBe('#FFFFFF')
    expect(hsvToHex(hexToHSV('#000000'))).toBe('#000000')
  })

  it('derives unique live document colors from tokens, hex values, and nested nodes', () => {
    const document = emptyV5Fixture()
    document.root.pages[0].children = [
      shape('first', 'primary', '#ABCDEF'),
      {
        ...shape('group', 'none'),
        kind: 'group',
        role: 'group',
        child_ids: ['child'],
        children: [shape('child', '#ABCDEF', 'danger')],
      },
    ]
    document.root.pages[0].child_ids = ['first', 'group']
    expect(usedColorsForDocument(document)).toEqual(['#2563EB', '#ABCDEF', '#DC2626'])
  })
})

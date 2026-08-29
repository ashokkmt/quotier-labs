import { describe, expect, it } from 'vitest'
import { cloneNode, findPlacement } from './placement'
import { emptyV5Fixture } from './fixtures'
import { du, type V5Node } from './model'

const node: V5Node = {
  id: 'a',
  kind: 'text',
  role: 'element',
  geometry: { x: du(0), y: du(0), width: du(1000), height: du(1000), rotation: 0 },
  layout_mode: 'fixed',
  locked: false,
  visibility: 'shown',
  optional: false,
}
describe('V5 placement', () => {
  it('finds a printable non-overlapping position and deep-remaps IDs', () => {
    const page = emptyV5Fixture().root.pages[0]
    const placement = findPlacement(page, node.geometry, { x: 1200, y: 1200 }, [
      { x: 1200, y: 1200, width: 1000, height: 1000 },
    ])
    expect(placement?.fallback).toBe(false)
    const copy = cloneNode(
      { ...node, role: 'group', children: [{ ...node, id: 'child' }], child_ids: ['child'] },
      (prefix) => `${prefix}-new`,
    )
    expect(copy.id).not.toBe('a')
    expect(copy.children?.[0].id).not.toBe('child')
  })
})

import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import { flattenNodes, isEffectivelyHidden, isEffectivelyLocked, remapPayload } from './selectors'
import type { V5Node } from './model'

const withGroup = (): V5Node[] => [
  {
    id: 'group',
    kind: 'group',
    role: 'group',
    geometry: { x: 0, y: 0, width: 5000, height: 5000, rotation: 0 },
    layout_mode: 'fixed',
    locked: true,
    visibility: 'shown',
    optional: false,
    children: [
      {
        id: 'child',
        kind: 'text',
        role: 'element',
        geometry: { x: 100, y: 100, width: 1000, height: 500, rotation: 0 },
        layout_mode: 'fixed',
        locked: false,
        visibility: 'shown',
        optional: false,
      },
    ],
  },
]

describe('V5 selectors', () => {
  it('derives effective lock and visibility through ancestors', () => {
    const doc = { ...emptyV5Fixture(), root: { ...emptyV5Fixture().root } }
    doc.root.pages[0].children = withGroup()
    expect(isEffectivelyLocked(doc, 'child')).toBe(true)
    expect(isEffectivelyLocked(doc, 'group')).toBe(true)
    const hiddenDoc = { ...doc }
    hiddenDoc.root.pages[0].children = [{ ...withGroup()[0], locked: false, visibility: 'hidden' }]
    expect(isEffectivelyHidden(hiddenDoc, 'child')).toBe(true)
    expect(isEffectivelyHidden(hiddenDoc, 'nonexistent')).toBe(false)
  })
  it('flattens nested nodes deterministically', () => {
    const flat = flattenNodes(withGroup())
    expect(flat.map((node) => node.id)).toEqual(['group', 'child'])
  })
  it('remaps payload node and story references', () => {
    const nodes: V5Node[] = [
      {
        id: 'frame',
        kind: 'flow-frame',
        role: 'flow-frame',
        story_id: 'story',
        geometry: { x: 0, y: 0, width: 1000, height: 1000, rotation: 0 },
        layout_mode: 'flow-frame',
        locked: false,
        visibility: 'shown',
        optional: false,
      },
    ]
    const used = new Set<string>()
    const remapped = remapPayload(
      nodes,
      [{ id: 'story', kind: 'rich-text', content: {} }],
      (prefix) => {
        const id = `${prefix}-fresh-${used.size}`
        used.add(id)
        return id
      },
    )
    expect(remapped.nodes[0].id).not.toBe('frame')
    expect(remapped.stories[0].id).not.toBe('story')
    expect(remapped.nodes[0].story_id).toBe(remapped.stories[0].id)
  })
})

import { describe, expect, it } from 'vitest'
import { getV5Widget, validateNodeContract } from './registry'
import type { V5Node } from './model'
import { createFlowFrame, createStory, storyOverset, validateStoryChains } from './stories'
import { emptyV5Fixture } from './fixtures'
describe('V5 registry and stories', () => {
  it('enforces controlled widget and binding contracts', () => {
    expect(getV5Widget('text')?.goRenderKind).toBe('text')
    expect(
      validateNodeContract({
        ...createFlowFrame('f', 's', 0, 0, 100, 100),
        binding_kind: 'company',
      }),
    ).toContain('unsupported binding')
  })
  it('validates flow-frame chains and reports overset', () => {
    const d = emptyV5Fixture()
    d.stories = [createStory('s', 'rich-text', { text: 'x'.repeat(1000) })]
    const frame = createFlowFrame('f', 's', 0, 0, 100, 100)
    d.root.pages[0].children = [frame]
    d.root.pages[0].child_ids = ['f']
    expect(validateStoryChains(d)).toBeNull()
    expect(storyOverset(d.stories[0], [frame])).toBe(true)
  })
})

describe('shape widget contract', () => {
  const shape = (props: Record<string, unknown>): V5Node => ({
    id: 's1',
    kind: 'shape',
    role: 'element',
    geometry: { x: 0, y: 0, width: 10000, height: 5000, rotation: 0 },
    layout_mode: 'fixed',
    locked: false,
    visibility: 'shown',
    optional: false,
    props,
  })
  it('accepts controlled fill and stroke tokens', () => {
    expect(
      validateNodeContract(
        shape({
          variant: 'rect',
          fill: 'primary',
          stroke: 'black',
          strokeStyle: 'dashed',
          strokeWidth: 2,
        }),
      ),
    ).toBeNull()
    expect(validateNodeContract(shape({ variant: 'ellipse', fill: 'none' }))).toBeNull()
    expect(
      validateNodeContract(shape({ variant: 'line', fill: 'none', stroke: 'black' })),
    ).toBeNull()
  })
  it('rejects arbitrary colors, variants, and out-of-bounds widths', () => {
    expect(validateNodeContract(shape({ variant: 'rect', fill: '#00ff00' }))).toMatch(
      /invalid fill/,
    )
    expect(validateNodeContract(shape({ variant: 'blob' }))).toMatch(/invalid shape variant/)
    expect(validateNodeContract(shape({ variant: 'rect', strokeStyle: 'zigzag' }))).toMatch(
      /invalid stroke style/,
    )
    expect(validateNodeContract(shape({ variant: 'rect', strokeWidth: 99 }))).toMatch(
      /out of bounds/,
    )
    expect(validateNodeContract(shape({ variant: 'rect', stroke: '#000' }))).toMatch(
      /invalid stroke/,
    )
  })
})

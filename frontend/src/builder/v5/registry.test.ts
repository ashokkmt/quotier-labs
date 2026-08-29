import { describe, expect, it } from 'vitest'
import { getV5Widget, validateNodeContract } from './registry'
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

import { describe, expect, it } from 'vitest'
import {
  A4_HEIGHT_DU,
  A4_WIDTH_DU,
  du,
  validateV5,
  V5_SCHEMA_VERSION,
  type V5Document,
} from './model'
import { parseV5, serializeV5 } from './serialization'
import { largeTableFixture } from './fixtures'

const fixture = (): V5Document => ({
  schema_version: V5_SCHEMA_VERSION,
  settings: { page_size: 'A4', orientation: 'portrait' },
  root: {
    pages: [
      {
        id: 'p1',
        width: du(A4_WIDTH_DU),
        height: du(A4_HEIGHT_DU),
        margin: { top: du(0), right: du(0), bottom: du(0), left: du(0) },
        child_ids: [],
        children: [],
      },
    ],
  },
})

describe('V5 model', () => {
  it('validates and round-trips a page fixture', () =>
    expect(parseV5(serializeV5(fixture())).schema_version).toBe(5))
  it('rejects non-A4 geometry', () =>
    expect(
      validateV5({ ...fixture(), root: { pages: [{ ...fixture().root.pages[0], width: du(1) }] } }),
    ).toContain('dimensions'))
  it('provides the 500-row baseline fixture without editor state', () => {
    const story = largeTableFixture().stories?.[0]
    expect(story).toBeDefined()
    expect((story!.content as { rows: unknown[] }).rows).toHaveLength(500)
  })
})

describe('V5 flow-frame continuation validation', () => {
  const frameDoc = (overrides: Record<string, unknown>): V5Document => {
    const base = fixture()
    base.stories = [{ id: 'story-1', kind: 'rich-text', content: { text: 'hi' } }]
    base.root.pages[0].child_ids = ['frame']
    base.root.pages[0].children = [
      {
        id: 'frame',
        kind: 'flow-frame',
        role: 'flow-frame',
        story_id: 'story-1',
        geometry: { x: du(0), y: du(0), width: du(100), height: du(100), rotation: 0 },
        layout_mode: 'flow-frame',
        locked: false,
        visibility: 'shown',
        optional: false,
      },
    ]
    Object.assign(base.root.pages[0].children[0], overrides)
    return base
  }
  it('rejects an unknown continuation master', () => {
    const doc = frameDoc({ continuation: 'auto-pages', continuation_master_id: 'missing' })
    expect(validateV5(doc)).toMatch(/missing continuation master/)
  })
  it('rejects an invalid continuation policy', () => {
    const doc = frameDoc({ continuation: 'magic' })
    expect(validateV5(doc)).toMatch(/invalid continuation policy/)
  })
  it('accepts a valid continuation master reference', () => {
    const doc = frameDoc({ continuation: 'auto-pages', continuation_master_id: 'master-1' })
    doc.root.masters = [{ id: 'master-1', child_ids: [], children: [] }]
    expect(validateV5(doc)).toBeNull()
  })
})

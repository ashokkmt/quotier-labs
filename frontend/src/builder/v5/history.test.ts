import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import { V5History } from './history'

describe('V5 command history', () => {
  it('keeps undo and redo isolated to one history instance', () => {
    const a = new V5History(emptyV5Fixture()); const b = new V5History(emptyV5Fixture())
    const command = { label: 'rename', apply: (d: ReturnType<typeof emptyV5Fixture>) => ({ ...d, settings: { ...d.settings, orientation: 'landscape' as const }, root: { ...d.root, pages: d.root.pages.map((p) => ({ ...p, width: p.height, height: p.width })) } }), revert: (d: ReturnType<typeof emptyV5Fixture>) => ({ ...d, settings: { ...d.settings, orientation: 'portrait' as const }, root: { ...d.root, pages: d.root.pages.map((p) => ({ ...p, width: p.height, height: p.width })) } }) }
    a.execute(command)
    expect(a.document.settings.orientation).toBe('landscape'); expect(b.document.settings.orientation).toBe('portrait')
    a.undo(); expect(a.document.settings.orientation).toBe('portrait'); a.redo(); expect(a.revision).toBe(3)
  })
})

import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import { V5Session } from './store'

describe('V5 per-instance session', () => {
  it('isolates documents and acknowledges only the current save revision', () => {
    const a = new V5Session(emptyV5Fixture()); const b = new V5Session(emptyV5Fixture())
    const command = { label: 'landscape', apply: (d: ReturnType<typeof emptyV5Fixture>) => ({ ...d, settings: { ...d.settings, orientation: 'landscape' as const }, root: { ...d.root, pages: d.root.pages.map((p) => ({ ...p, width: p.height, height: p.width })) } }), revert: (d: ReturnType<typeof emptyV5Fixture>) => ({ ...d, settings: { ...d.settings, orientation: 'portrait' as const }, root: { ...d.root, pages: d.root.pages.map((p) => ({ ...p, width: p.height, height: p.width })) } }) }
    a.execute(command); const first = a.beginSave(); const second = { ...command, label: 'landscape-again', apply: (d: ReturnType<typeof emptyV5Fixture>) => ({ ...d, settings: { ...d.settings, default_master_id: 'master-1' } }) }; a.execute(second)
    a.acknowledgeSave(first.revision)
    expect(a.getSnapshot().saveStatus).toBe('unsaved'); expect(b.getSnapshot().revision).toBe(0)
    a.failSave(); expect(a.getSnapshot().saveStatus).toBe('failed'); const latest = a.beginSave(); a.acknowledgeSave(latest.revision); expect(a.getSnapshot().saveStatus).toBe('saved')
  })
})

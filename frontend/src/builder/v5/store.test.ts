import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import { V5Session } from './store'

describe('V5 per-instance session', () => {
  it('isolates documents and acknowledges only the current save revision', () => {
    const a = new V5Session(emptyV5Fixture())
    const b = new V5Session(emptyV5Fixture())
    const command = {
      label: 'landscape',
      apply: (d: ReturnType<typeof emptyV5Fixture>) => ({
        ...d,
        settings: { ...d.settings, orientation: 'landscape' as const },
        root: {
          ...d.root,
          pages: d.root.pages.map((p) => ({ ...p, width: p.height, height: p.width })),
        },
      }),
      revert: (d: ReturnType<typeof emptyV5Fixture>) => ({
        ...d,
        settings: { ...d.settings, orientation: 'portrait' as const },
        root: {
          ...d.root,
          pages: d.root.pages.map((p) => ({ ...p, width: p.height, height: p.width })),
        },
      }),
    }
    a.execute(command)
    const first = a.beginSave()
    const second = {
      ...command,
      label: 'landscape-again',
      apply: (d: ReturnType<typeof emptyV5Fixture>) => ({
        ...d,
        settings: { ...d.settings, default_master_id: 'master-1' },
      }),
    }
    a.execute(second)
    a.acknowledgeSave(first.revision)
    expect(a.getSnapshot().saveStatus).toBe('unsaved')
    expect(b.getSnapshot().revision).toBe(0)
    a.failSave()
    expect(a.getSnapshot().saveStatus).toBe('failed')
    const latest = a.beginSave()
    a.acknowledgeSave(latest.revision)
    expect(a.getSnapshot().saveStatus).toBe('saved')
  })
})

describe('V5 session save + history wiring', () => {
  it('serializes the live document on beginSave and tracks undo/redo availability', () => {
    const session = new V5Session(emptyV5Fixture())
    const command = {
      label: 'noop',
      apply: (d: ReturnType<typeof emptyV5Fixture>) => ({ ...d }),
      revert: (d: ReturnType<typeof emptyV5Fixture>) => ({ ...d }),
    }
    expect(session.canUndo()).toBe(false)
    expect(session.canRedo()).toBe(false)
    session.execute(command)
    const started = session.beginSave()
    // beginSave must return the exact serialized live state, not a stale copy.
    expect(JSON.parse(started.document)).toEqual(session.getSnapshot().document)
    expect(started.revision).toBe(session.getSnapshot().revision)
    expect(session.canUndo()).toBe(true)
    session.undo()
    expect(session.canRedo()).toBe(true)
    expect(session.getSnapshot().saveStatus).toBe('unsaved')
  })

  it('rejects a stale save acknowledgement after undo', () => {
    const session = new V5Session(emptyV5Fixture())
    session.execute({
      label: 'first',
      apply: (d: ReturnType<typeof emptyV5Fixture>) => ({
        ...d,
        settings: { ...d.settings, default_master_id: '' },
      }),
      revert: (d: ReturnType<typeof emptyV5Fixture>) => d,
    })
    const stale = session.beginSave()
    session.undo()
    session.acknowledgeSave(stale.revision)
    // An older revision must never mark the current state as saved.
    expect(session.getSnapshot().saveStatus).toBe('unsaved')
    expect(session.getSnapshot().acknowledgedRevision).toBe(stale.revision)
  })
})

describe('V5 session snapshot identity (useSyncExternalStore contract)', () => {
  it('returns the same cached snapshot object until a mutation emits', () => {
    const session = new V5Session(emptyV5Fixture())
    const first = session.getSnapshot()
    // Repeated reads without a mutation must be identity-stable or React loops forever.
    expect(session.getSnapshot()).toBe(first)
    expect(session.getSnapshot()).toBe(first)
    // A selection change emits but does not touch history.
    session.selectNode('nonexistent')
    const afterSelection = session.getSnapshot()
    expect(afterSelection).not.toBe(first)
    expect(session.getSnapshot()).toBe(afterSelection)
    // A committed command rebuilds the snapshot and enables undo.
    session.execute({
      label: 'noop',
      apply: (d: ReturnType<typeof emptyV5Fixture>) => ({ ...d }),
      revert: (d: ReturnType<typeof emptyV5Fixture>) => ({ ...d }),
    })
    const afterExecute = session.getSnapshot()
    expect(afterExecute).not.toBe(afterSelection)
    session.undo()
    expect(session.getSnapshot()).not.toBe(afterExecute)
  })
})

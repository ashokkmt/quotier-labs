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

describe('V5 selection primary item', () => {
  it('keeps the most recently added selected node as primary and repairs it after toggle-off', () => {
    const session = new V5Session(emptyV5Fixture())
    session.selectNode('one')
    session.selectNode('two', true)
    expect(session.getSnapshot().selectedNodeId).toBe('two')
    session.selectNode('two', true)
    expect(session.getSnapshot().selectedNodeIds).toEqual(['one'])
    expect(session.getSnapshot().selectedNodeId).toBe('one')
  })
})

describe('V5 clipboard in group scope', () => {
  it('copies a direct group child and pastes the remapped object back into that group', () => {
    const document = emptyV5Fixture()
    const child = {
      id: 'child',
      kind: 'shape',
      role: 'element' as const,
      geometry: { x: 500, y: 500, width: 1000, height: 1000, rotation: 0 },
      layout_mode: 'fixed' as const,
      locked: false,
      visibility: 'shown' as const,
      optional: false,
    }
    document.root.pages[0].children = [
      {
        id: 'group',
        kind: 'group',
        role: 'group',
        geometry: { x: 1000, y: 1000, width: 6000, height: 6000, rotation: 0 },
        layout_mode: 'fixed',
        locked: false,
        visibility: 'shown',
        optional: false,
        child_ids: ['child'],
        children: [child],
      },
    ]
    document.root.pages[0].child_ids = ['group']
    const session = new V5Session(document)
    session.enterGroup('group')
    session.selectNode('child')
    expect(session.copySelection()).toBe(1)
    const pasted = session.paste('standard', { x: 4000, y: 4000 })
    const group = session.getSnapshot().document.root.pages[0].children[0]
    expect(pasted).toHaveLength(1)
    expect(group.children).toHaveLength(2)
    expect(group.child_ids).toEqual(['child', pasted[0]])
  })
})

describe('V5 clipboard on authored pages', () => {
  it('copies and pastes a root object at a requested page point', () => {
    const document = emptyV5Fixture()
    document.root.pages[0].children = [
      {
        id: 'heading',
        kind: 'text',
        role: 'element',
        geometry: { x: 500, y: 500, width: 4000, height: 1000, rotation: 0 },
        layout_mode: 'intrinsic',
        locked: false,
        visibility: 'shown',
        optional: false,
        props: { text: 'Heading' },
      },
    ]
    document.root.pages[0].child_ids = ['heading']
    const session = new V5Session(document)
    session.selectNode('heading')
    expect(session.copySelection()).toBe(1)
    session.selectNode(null)
    const pasted = session.paste('standard', { x: 12000, y: 14000 })
    expect(pasted).toHaveLength(1)
    expect(session.getSnapshot().document.root.pages[0].children).toHaveLength(2)
    expect(session.getSnapshot().selectedNodeId).toBe(pasted[0])
  })
})

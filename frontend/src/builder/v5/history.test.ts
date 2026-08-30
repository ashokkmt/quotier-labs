import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import { V5History } from './history'

describe('V5 command history', () => {
  it('keeps undo and redo isolated to one history instance', () => {
    const a = new V5History(emptyV5Fixture())
    const b = new V5History(emptyV5Fixture())
    const command = {
      label: 'rename',
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
    expect(a.document.settings.orientation).toBe('landscape')
    expect(b.document.settings.orientation).toBe('portrait')
    a.undo()
    expect(a.document.settings.orientation).toBe('portrait')
    a.redo()
    expect(a.revision).toBe(3)
  })

  it('coalesces a session while preserving the first inverse', () => {
    const history = new V5History(emptyV5Fixture())
    const setMaster = (value: string) => {
      let before = ''
      return {
        label: 'buffered edit',
        coalesceKey: 'field:master',
        apply: (document: ReturnType<typeof emptyV5Fixture>) => {
          before = document.settings.default_master_id ?? ''
          return { ...document, settings: { ...document.settings, default_master_id: value } }
        },
        revert: (document: ReturnType<typeof emptyV5Fixture>) => ({
          ...document,
          settings: { ...document.settings, default_master_id: before },
        }),
      }
    }
    history.execute(setMaster('a'))
    history.execute(setMaster('ab'))
    history.execute(setMaster('abc'))
    expect(history.document.settings.default_master_id).toBe('abc')
    history.undo()
    expect(history.document.settings.default_master_id).toBe('')
    history.redo()
    expect(history.document.settings.default_master_id).toBe('abc')
  })
})

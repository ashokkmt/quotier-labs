import { describe, expect, it } from 'vitest'
import { historyShortcutForEvent } from './historyShortcuts'

describe('historyShortcutForEvent', () => {
  it.each([
    [{ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false }, 'undo'],
    [{ key: 'Z', metaKey: false, ctrlKey: true, shiftKey: false }, 'undo'],
    [{ key: 'z', metaKey: true, ctrlKey: false, shiftKey: true }, 'redo'],
    [{ key: 'y', metaKey: false, ctrlKey: true, shiftKey: false }, 'redo'],
  ])('maps cross-platform history keys', (event, expected) => {
    expect(historyShortcutForEvent(event)).toBe(expected)
  })
})

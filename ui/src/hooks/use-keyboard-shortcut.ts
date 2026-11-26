import { useEffect } from 'react'

type KeyCombo = {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

export function useKeyboardShortcut(
  combo: KeyCombo,
  callback: (e: KeyboardEvent) => void,
  preventDefault = true,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const matchKey = e.key.toLowerCase() === combo.key.toLowerCase()

      const matchShift = !!combo.shiftKey === e.shiftKey
      const matchAlt = !!combo.altKey === e.altKey

      // For cross-platform support (Mac uses Meta for Cmd, Windows uses Ctrl)
      const isCmdOrCtrl = e.ctrlKey || e.metaKey
      const comboRequiresCmdOrCtrl = combo.ctrlKey || combo.metaKey

      const isMatch =
        matchKey &&
        matchShift &&
        matchAlt &&
        (comboRequiresCmdOrCtrl ? isCmdOrCtrl : !e.ctrlKey && !e.metaKey)

      if (isMatch) {
        if (preventDefault) e.preventDefault()
        callback(e)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [combo, callback, preventDefault])
}

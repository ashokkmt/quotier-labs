import { useState, useCallback } from 'react'
import type { Command } from '../commands/types'

export function useUndoRedo(initialState: any) {
  const [state, setState] = useState(initialState)
  const [undoStack, setUndoStack] = useState<Command[]>([])
  const [redoStack, setRedoStack] = useState<Command[]>([])
  const [dirty, setDirty] = useState(false)

  const applyCommand = useCallback((cmd: Command) => {
    setState((current: any) => {
      setUndoStack((prev) => {
        const newStack = [...prev]
        if (newStack.length > 0) {
          const top = newStack[newStack.length - 1]
          if (top.coalesce && top.coalesce(cmd)) {
            return newStack
          }
        }
        return [...newStack, cmd]
      })
      setRedoStack([])
      setDirty(true)
      return cmd.apply(current)
    })
  }, [])

  const undo = useCallback(() => {
    if (undoStack.length === 0) return
    const cmd = undoStack[undoStack.length - 1]
    const inverted = cmd.invert()

    setState((current: any) => inverted.apply(current))
    setUndoStack((prev) => prev.slice(0, -1))
    setRedoStack((prev) => [...prev, inverted])
    setDirty(true)
  }, [undoStack])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    const cmd = redoStack[redoStack.length - 1]
    const inverted = cmd.invert() // Re-apply the original

    setState((current: any) => inverted.apply(current))
    setRedoStack((prev) => prev.slice(0, -1))
    setUndoStack((prev) => [...prev, inverted])
    setDirty(true)
  }, [redoStack])

  return {
    state,
    setState, // For initial load
    applyCommand,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    dirty,
    setDirty,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'

export type SaveState = 'Saved' | 'Saving…' | 'Save failed — retrying' | 'Unsaved changes'

export function createSerialTask<T, R>(task: (value: T) => Promise<R>) {
  let tail: Promise<unknown> = Promise.resolve()
  return (value: T) => {
    const current = tail.catch(() => undefined).then(() => task(value))
    tail = current.catch(() => undefined)
    return current
  }
}

// Keeps one in-flight save and, while it is running, only the newest request.
// Saving every intermediate editor state lets a busy table editor build an
// unbounded queue of stale full-document writes.
export function createLatestTask<T, R>(task: (value: T) => Promise<R>) {
  let hasPending = false
  let pending!: T
  let active: Promise<R | undefined> | null = null

  const drain = async () => {
    let result: R | undefined
    while (hasPending) {
      const next = pending
      hasPending = false
      result = await task(next)
    }
    return result
  }

  return (value: T) => {
    pending = value
    hasPending = true
    if (!active) {
      active = drain().finally(() => {
        active = null
        // A request can arrive between the final loop condition and finally.
        if (hasPending) void schedule(pending)
      })
    }
    return active
  }

  function schedule(value: T) {
    pending = value
    hasPending = true
    if (!active)
      active = drain().finally(() => {
        active = null
      })
    return active
  }
}

export function useSerialSave<T, R>(save: (value: T) => Promise<R>) {
  const latest = useRef(save)
  useEffect(() => {
    latest.current = save
  }, [save])
  const runLatest = useCallback((value: T) => latest.current(value), [])
  // oxlint-disable-next-line react-hooks/refs -- initializer stores the callback without invoking it
  const [queued] = useState(() => createSerialTask(runLatest))
  return queued
}

export function useAutosave(
  document: any,
  dirty: boolean,
  onSave: (doc: any) => Promise<unknown>,
  clearDirty: () => void,
  debounceMs: number = 800,
) {
  const [saveState, setSaveState] = useState<SaveState>('Saved')
  const [lastSaved, setLastSaved] = useState<Date>(new Date())
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const retryCount = useRef(0)
  const latestDocument = useRef(document)
  const dirtyRef = useRef(dirty)
  const onSaveRef = useRef(onSave)
  const clearDirtyRef = useRef(clearDirty)
  latestDocument.current = document
  dirtyRef.current = dirty
  onSaveRef.current = onSave
  clearDirtyRef.current = clearDirty
  const { toast } = useToast()

  const executeSave = async (docToSave: any) => {
    setSaveState('Saving…')
    try {
      await onSaveRef.current(docToSave)
      setSaveState('Saved')
      setLastSaved(new Date())
      // A slower save must never mark edits made while it was running as saved.
      if (latestDocument.current === docToSave && dirtyRef.current) clearDirtyRef.current()
      retryCount.current = 0
    } catch {
      if (retryCount.current < 3) {
        retryCount.current += 1
        setSaveState('Save failed — retrying')
        retryTimerRef.current = setTimeout(
          () => void queueSave(latestDocument.current),
          1000 * Math.pow(2, retryCount.current),
        ) // exponential backoff
      } else {
        toast({
          title: 'Autosave failed permanently',
          description: 'Please check the app status and press Cmd/Ctrl+S to retry.',
          variant: 'destructive',
        })
        setSaveState('Unsaved changes')
      }
    }
  }

  // oxlint-disable-next-line react-hooks/refs -- initializer stores the callback without invoking it
  const [queueSave] = useState(() => createLatestTask(executeSave))

  useEffect(() => {
    if (!dirty) return
    setSaveState('Unsaved changes')
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      void queueSave(document)
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, dirty])

  useEffect(() => {
    const handleBlur = () => {
      if (dirty) {
        if (timerRef.current) clearTimeout(timerRef.current)
        void queueSave(document)
      }
    }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, dirty])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty) {
          if (timerRef.current) clearTimeout(timerRef.current)
          void queueSave(document)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, dirty])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    },
    [],
  )

  return { saveState, lastSaved, forceSave: () => queueSave(document) }
}

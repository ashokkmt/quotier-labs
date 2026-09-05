import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'

export type SaveState = 'Saved' | 'Saving…' | 'Save failed — retrying' | 'Unsaved changes'

export function useAutosave(
  document: any,
  dirty: boolean,
  onSave: (doc: any) => Promise<void>,
  clearDirty: () => void,
  debounceMs: number = 800,
) {
  const [saveState, setSaveState] = useState<SaveState>('Saved')
  const [lastSaved, setLastSaved] = useState<Date>(new Date())
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const retryCount = useRef(0)
  const latestDocument = useRef(document)
  const dirtyRef = useRef(dirty)
  latestDocument.current = document
  dirtyRef.current = dirty
  const { toast } = useToast()

  const executeSave = async (docToSave: any) => {
    setSaveState('Saving…')
    try {
      await onSave(docToSave)
      setSaveState('Saved')
      setLastSaved(new Date())
      // A slower save must never mark edits made while it was running as saved.
      if (latestDocument.current === docToSave && dirtyRef.current) clearDirty()
      retryCount.current = 0
    } catch {
      if (retryCount.current < 3) {
        retryCount.current += 1
        setSaveState('Save failed — retrying')
        setTimeout(
          () => executeSave(latestDocument.current),
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

  useEffect(() => {
    if (!dirty) return
    setSaveState('Unsaved changes')
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      executeSave(document)
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, dirty])

  useEffect(() => {
    const handleBlur = () => {
      if (dirty) {
        if (timerRef.current) clearTimeout(timerRef.current)
        executeSave(document)
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
          executeSave(document)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, dirty])

  return { saveState, lastSaved, forceSave: () => executeSave(document) }
}

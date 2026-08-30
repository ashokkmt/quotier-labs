import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { GetTemplate, UpdateTemplate } from '../../../wailsjs/go/wails/TemplateHandler'
import { MigrateDocumentToV5 } from '../../../wailsjs/go/wails/DocumentHandler'
import { BuilderEngine, V5BuilderEngine, type V5EngineHandle } from '../../builder'
import { isFreeformV5Enabled } from '../../builder/feature'
import type { V5Document } from '../../builder/v5/model'
import { normalize, serialize } from '../../builder'
import { useAutosave } from '../quotations/hooks/useAutosave'
import { useRecovery } from '../quotations/hooks/useRecovery'
import { useNavigationGuard } from '../../shared/hooks/useNavigationGuard'
import { SaveIndicator } from '../quotations/components/SaveIndicator'
import { UndoRedoControls } from '../quotations/components/UndoRedoControls'

export function TemplateBuilder({
  templateId,
  onBack,
}: {
  templateId: string
  onBack: () => void
}) {
  const [document, setDocument] = useState<any>(() => normalize({}))
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [v5UndoRedo, setV5UndoRedo] = useState({ canUndo: false, canRedo: false })
  const { toast } = useToast()
  const v5EngineRef = useRef<V5EngineHandle | null>(null)

  const { clearRecovery } = useRecovery(templateId, document)
  useNavigationGuard(dirty)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    const load = async () => {
      try {
        const res = await withTimeout(GetTemplate(templateId), 8000)
        if (cancelled) return
        setName(res.name)
        setDescription(res.description || '')
        const raw = res.layout || JSON.stringify(normalize({}))
        const parsed = JSON.parse(raw)
        const nextDocument =
          isFreeformV5Enabled() && parsed?.schema_version !== 5
            ? JSON.parse(await withTimeout(MigrateDocumentToV5(raw), 8000))
            : parsed
        if (!cancelled) setDocument(nextDocument)
      } catch (err) {
        if (cancelled) return
        setLoadError(String(err))
        toast({
          title: 'Failed to load template',
          description: String(err),
          variant: 'destructive',
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, loadAttempt])

  const autosavePayload = useMemo(
    () => ({ document, name, description }),
    [description, document, name],
  )

  const save = async (payload: typeof autosavePayload) => {
    const docToSave = payload.document
    if (!docToSave) return
    const v5 = docToSave?.schema_version === 5 ? v5EngineRef.current : null
    let revision = 0
    let layout: string
    if (v5) {
      const started = v5.beginSave()
      revision = started.revision
      layout = started.document
    } else if (docToSave?.schema_version === 5) {
      layout = JSON.stringify(docToSave)
    } else {
      layout = serialize(docToSave)
    }
    try {
      await UpdateTemplate({
        id: templateId,
        name: payload.name,
        description: payload.description,
        layout,
      })
      v5?.acknowledgeSave(revision)
      clearRecovery()
    } catch (err) {
      v5?.failSave()
      throw err
    }
  }

  const { saveState, lastSaved, forceSave } = useAutosave(
    autosavePayload,
    dirty,
    save,
    () => setDirty(false),
    800,
  )

  const handleBack = async () => {
    if (leaving) return
    if (!dirty) {
      onBack()
      return
    }
    setLeaving(true)
    try {
      await save(autosavePayload)
      setDirty(false)
      onBack()
    } catch (err) {
      toast({
        title: 'Could not leave template',
        description: `Your latest changes could not be saved. ${String(err)}`,
        variant: 'destructive',
      })
      setLeaving(false)
    }
  }

  if (loading)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6" role="status">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm text-muted-foreground">Loading template…</p>
      </div>
    )
  if (loadError)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold">Template could not be opened</h1>
          <p role="alert" className="text-sm text-muted-foreground">
            {loadError}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={onBack}>
              Back to templates
            </Button>
            <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</Button>
          </div>
        </div>
      </div>
    )
  return (
    <div className="h-full min-h-0 flex flex-col">
      <header className="relative z-30 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-background p-2 shadow-sm sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to templates"
            onClick={() => void handleBack()}
            disabled={leaving}
            className="h-9 w-9 shrink-0"
          >
            {leaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeft className="h-4 w-4" />
            )}
          </Button>
          <div className="hidden sm:block">
            <UndoRedoControls
              onUndo={() => {
                v5EngineRef.current?.undo()
                setV5UndoRedo({
                  canUndo: v5EngineRef.current?.canUndo() ?? false,
                  canRedo: v5EngineRef.current?.canRedo() ?? false,
                })
              }}
              onRedo={() => {
                v5EngineRef.current?.redo()
                setV5UndoRedo({
                  canUndo: v5EngineRef.current?.canUndo() ?? false,
                  canRedo: v5EngineRef.current?.canRedo() ?? false,
                })
              }}
              canUndo={v5UndoRedo.canUndo}
              canRedo={v5UndoRedo.canRedo}
            />
          </div>
          <div className="hidden min-w-0 md:block">
            <SaveIndicator state={saveState} lastSaved={lastSaved} />
          </div>
        </div>
        <div className="col-span-2 flex min-w-0 items-center justify-end gap-2 lg:col-span-1">
          <Input
            aria-label="Template name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setDirty(true)
            }}
            className="min-w-0 flex-1 font-semibold lg:w-72 lg:flex-none"
          />
          <Button
            onClick={() => forceSave()}
            disabled={saveState === 'Saving…'}
            className="shrink-0"
          >
            <Save className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 relative overflow-hidden">
        {isFreeformV5Enabled() && document?.schema_version === 5 ? (
          <V5BuilderEngine
            document={document as V5Document}
            onReady={(handle) => {
              v5EngineRef.current = handle
              setV5UndoRedo({
                canUndo: handle?.canUndo() ?? false,
                canRedo: handle?.canRedo() ?? false,
              })
            }}
            onChange={(newDoc) => {
              setDocument(newDoc)
              setDirty(true)
              setV5UndoRedo({
                canUndo: v5EngineRef.current?.canUndo() ?? false,
                canRedo: v5EngineRef.current?.canRedo() ?? false,
              })
            }}
          />
        ) : (
          <BuilderEngine
            document={document}
            onChange={(newDoc: any) => {
              setDocument(newDoc)
              setDirty(true)
            }}
          />
        )}
      </div>
    </div>
  )
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('The desktop service did not respond. Please retry.')),
      timeoutMs,
    )
    promise.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

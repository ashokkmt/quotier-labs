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
  const [dirty, setDirty] = useState(false)
  const [v5UndoRedo, setV5UndoRedo] = useState({ canUndo: false, canRedo: false })
  const { toast } = useToast()
  const v5EngineRef = useRef<V5EngineHandle | null>(null)

  const { clearRecovery } = useRecovery(templateId, document)
  useNavigationGuard(dirty)

  useEffect(() => {
    GetTemplate(templateId)
      .then(async (res) => {
        setName(res.name)
        setDescription(res.description || '')
        const raw = res.layout || JSON.stringify(normalize({}))
        const parsed = JSON.parse(raw)
        setDocument(
          isFreeformV5Enabled() && parsed?.schema_version !== 5
            ? JSON.parse(await MigrateDocumentToV5(raw))
            : parsed,
        )
      })
      .catch((err) =>
        toast({
          title: 'Failed to load template',
          description: String(err),
          variant: 'destructive',
        }),
      )
      .finally(() => setLoading(false)) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

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

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  return (
    <div className="h-full min-h-0 flex flex-col">
      <header className="relative z-30 flex max-h-[42vh] shrink-0 flex-wrap items-center gap-2 overflow-y-auto border-b bg-background p-2 shadow-sm sm:flex-nowrap sm:px-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Back</span>
        </Button>
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
        <div className="min-w-0 flex-1 sm:flex-none">
          <SaveIndicator state={saveState} lastSaved={lastSaved} />
        </div>
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-initial">
          <Input
            aria-label="Template name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setDirty(true)
            }}
            className="min-w-0 flex-1 font-semibold sm:w-72 sm:flex-none"
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

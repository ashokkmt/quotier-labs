import { useEffect, useRef, useState } from 'react'
import { Save, Loader2 } from 'lucide-react'
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
  const { toast } = useToast()
  const v5EngineRef = useRef<V5EngineHandle | null>(null)
  const nameRef = useRef(name)
  const descriptionRef = useRef(description)
  nameRef.current = name
  descriptionRef.current = description

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

  const save = async (docToSave: any) => {
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
        name: nameRef.current,
        description: descriptionRef.current,
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
    document,
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
      <header className="flex items-center gap-3 p-3 border-b bg-background z-10 relative">
        <Input
          aria-label="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-sm font-semibold"
        />
        <Button onClick={() => forceSave()} disabled={saveState === 'Saving...'}>
          <Save className="w-4 h-4 mr-2" /> Save
        </Button>
        <SaveIndicator state={saveState} lastSaved={lastSaved} />
        <Button variant="ghost" onClick={onBack}>
          Close
        </Button>
      </header>
      <div className="flex-1 relative overflow-hidden">
        {isFreeformV5Enabled() && document?.schema_version === 5 ? (
          <V5BuilderEngine
            document={document as V5Document}
            onReady={(handle) => {
              v5EngineRef.current = handle
            }}
            onChange={(newDoc) => {
              setDocument(newDoc)
              setDirty(true)
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

import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  GetQuotation,
  SaveQuotationDocument,
  UpdateQuotationCustomer,
  SaveAsTemplate,
} from '../../../wailsjs/go/wails/QuotationHandler'
import {
  GetDocumentLayoutDiagnostics,
  MigrateDocumentToV5,
} from '../../../wailsjs/go/wails/DocumentHandler'
import { BuilderHeader } from './BuilderHeader'
import { BuilderEngine, V5BuilderEngine, type V5EngineHandle } from '../../builder'
import { isFreeformV5Enabled } from '../../builder/feature'
import type { V5Document } from '../../builder/v5/model'
import { Preview } from './components/Preview'
import { useUndoRedo } from './hooks/useUndoRedo'
import { useAutosave } from './hooks/useAutosave'
import { useRecovery } from './hooks/useRecovery'
import { useNavigationGuard } from '../../shared/hooks/useNavigationGuard'
import { SnapshotCommand } from './commands/base'
import { UndoRedoControls } from './components/UndoRedoControls'
import { SaveIndicator } from './components/SaveIndicator'
import { FinalizeQuotation, UpdateQuotationStatus } from '../../../wailsjs/go/wails/QuotationHandler'
import { normalize, serialize } from '../../builder'

export function QuotationBuilder({
  quotationId,
  onBack,
}: {
  quotationId: string
  onBack: () => void
}) {
  const [quotation, setQuotation] = useState<any>(null)
  const {
    state: document,
    setState: setDocument,
    applyCommand,
    undo,
    redo,
    canUndo,
    canRedo,
    dirty,
    setDirty,
  } = useUndoRedo(null)
  const [loading, setLoading] = useState(true)

  const [readOnly, setReadOnly] = useState(false)
  const { toast } = useToast()
  const v5EngineRef = useRef<V5EngineHandle | null>(null)
  const [v5UndoRedo, setV5UndoRedo] = useState({ canUndo: false, canRedo: false })

  const { clearRecovery } = useRecovery(quotationId, document)
  useNavigationGuard(dirty)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await GetQuotation(quotationId)
        setQuotation(res)
        if (res.document) {
          const raw = JSON.parse(res.document)
          const parsed =
            isFreeformV5Enabled() && raw?.schema_version !== 5
              ? JSON.parse(await MigrateDocumentToV5(res.document))
              : raw?.schema_version === 5
                ? raw
                : normalize(raw)
          // Never replace persisted content silently with a local checkpoint.
          // A stale checkpoint previously made an existing quotation appear empty.
          setDocument(parsed)
          setDirty(false)
        }
        if (res.status !== 'DRAFT') setReadOnly(true)
      } catch (err: any) {
        toast({
          title: 'Failed to load quotation',
          description: err.toString(),
          variant: 'destructive',
        })
        onBack()
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId])

  const executeSave = async (docToSave: any) => {
    if (!docToSave) return
    // For V5 documents the per-instance session serializes the authoritative state, so a save
    // can never race a pending gesture or mark a newer revision as saved.
    const v5 = docToSave?.schema_version === 5 ? v5EngineRef.current : null
    let revision = 0
    let payload: string
    if (v5) {
      const started = v5.beginSave()
      revision = started.revision
      payload = started.document
    } else if (docToSave?.schema_version === 5) {
      payload = JSON.stringify(docToSave)
    } else {
      payload = serialize(docToSave)
    }
    try {
      const res = await SaveQuotationDocument({ id: quotationId, document: payload })
      v5?.acknowledgeSave(revision)
      setQuotation(res)
      clearRecovery()
    } catch (err) {
      v5?.failSave()
      throw err
    }
  }

  const handleFinalize = async () => {
    if (
      !confirm(
        'Are you sure you want to finalize this quotation? It will become read-only and immutable.',
      )
    )
      return
    try {
      await executeSave(document) // ensure latest is saved
      const res = await FinalizeQuotation(quotationId)
      setQuotation(res)
      setReadOnly(true)
      toast({ title: 'Quotation Finalized' })
    } catch (err: any) {
      toast({ title: 'Failed to finalize', description: err.toString(), variant: 'destructive' })
    }
  }

  const handlePreviewMode = async () => {
    if (readOnly) {
      setReadOnly(false)
      return
    }
    try {
      // The PDF preview is intentionally rendered from the persisted V4
      // document, so save the current builder state before switching modes.
      await executeSave(document)
      setDirty(false)
      setReadOnly(true)
    } catch (err) {
      toast({
        title: 'Could not prepare preview',
        description: String(err),
        variant: 'destructive',
      })
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await UpdateQuotationStatus(quotationId, newStatus)
      setQuotation(res)
      toast({ title: `Status updated to ${newStatus}` })
    } catch (err: any) {
      toast({
        title: 'Failed to update status',
        description: err.toString(),
        variant: 'destructive',
      })
    }
  }

  const { saveState, lastSaved, forceSave } = useAutosave(
    document,
    dirty,
    executeSave,
    () => setDirty(false),
    800,
  )

  const handleCustomerChange = async (customerId: string) => {
    try {
      const res = await UpdateQuotationCustomer({
        id: quotationId,
        customer_id: customerId,
      })
      setQuotation(res)
      toast({ title: 'Customer updated' })
    } catch (err: any) {
      toast({
        title: 'Failed to update customer',
        description: err.toString(),
        variant: 'destructive',
      })
    }
  }

  const handleSaveAsTemplate = async () => {
    const name = window.prompt('Template name')?.trim()
    if (!name) return
    try {
      await SaveAsTemplate({ quotation_id: quotationId, name })
      toast({ title: 'Template saved', description: 'The quotation structure is now reusable.' })
    } catch (err: any) {
      toast({ title: 'Could not save template', description: String(err), variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-muted/20">
      <BuilderHeader
        quotation={quotation}
        onBack={onBack}
        onSave={forceSave}
        saving={saveState === 'Saving...'}
        readOnly={readOnly}
        onToggleReadOnly={handlePreviewMode}
        onCustomerChange={handleCustomerChange}
        saveIndicator={<SaveIndicator state={saveState} lastSaved={lastSaved} />}
        undoRedoControls={
          isFreeformV5Enabled() && document?.schema_version === 5 ? (
            <UndoRedoControls
              onUndo={() => v5EngineRef.current?.undo()}
              onRedo={() => v5EngineRef.current?.redo()}
              canUndo={v5UndoRedo.canUndo}
              canRedo={v5UndoRedo.canRedo}
            />
          ) : (
            <UndoRedoControls onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} />
          )
        }
        onFinalize={handleFinalize}
        onStatusChange={handleStatusChange}
        onSaveAsTemplate={handleSaveAsTemplate}
      />

      <div className="flex-1 min-h-0 overflow-hidden p-6 flex gap-6">
        <div className="flex-1">
          {readOnly ? (
            <Preview
              companyId={quotation.company_id}
              quotationId={quotation.id}
              // eslint-disable-next-line react/purity
              version={lastSaved ? lastSaved.getTime() : new Date().getTime()}
            />
          ) : isFreeformV5Enabled() && document?.schema_version === 5 ? (
            <V5BuilderEngine
              document={document as V5Document}
              onChange={(newDoc) => {
                setDocument(newDoc)
                setDirty(true)
                // Functional update with equality bail: a fresh object here would re-render the
                // parent on every change and re-trigger the engine's change bridge forever.
                setV5UndoRedo((prev) => {
                  const canUndo = v5EngineRef.current?.canUndo() ?? false
                  const canRedo = v5EngineRef.current?.canRedo() ?? false
                  return prev.canUndo === canUndo && prev.canRedo === canRedo
                    ? prev
                    : { canUndo, canRedo }
                })
              }}
              onReady={(handle) => {
                v5EngineRef.current = handle
              }}
              resolveDiagnostics={async (doc) =>
                GetDocumentLayoutDiagnostics(
                  quotation.company_id,
                  quotation.id,
                  JSON.stringify(doc),
                )
              }
            />
          ) : (
            <BuilderEngine
              document={document}
              onChange={(newDoc: any) =>
                applyCommand(new SnapshotCommand(document, newDoc, 'Edit'))
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}

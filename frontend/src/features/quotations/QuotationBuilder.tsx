import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  GetQuotation,
  SaveQuotationDocument,
  UpdateQuotationCustomer,
  UpdateQuotationExpectedTotal,
  SaveAsTemplate,
} from '../../../wailsjs/go/wails/QuotationHandler'
import { GetDocumentLayoutDiagnostics } from '../../../wailsjs/go/wails/DocumentHandler'
import { BuilderHeader } from './BuilderHeader'
import {
  V5BuilderEngine,
  V6BuilderEngine,
  type V5EngineHandle,
  type V6Document,
  type V6EngineHandle,
} from '../../builder'
import type { V5Document } from '../../builder/v5/model'
import { Preview } from './components/Preview'
import { useAutosave } from './hooks/useAutosave'
import { useRecovery } from './hooks/useRecovery'
import { useNavigationGuard } from '../../shared/hooks/useNavigationGuard'
import { UndoRedoControls } from './components/UndoRedoControls'
import { SaveIndicator } from './components/SaveIndicator'
import { useFrontendDiagnostics } from '../../shared/diagnostics/useFrontendDiagnostics'
import { FinalizeQuotation } from '../../../wailsjs/go/wails/QuotationHandler'

export function QuotationBuilder({
  quotationId,
  onBack,
}: {
  quotationId: string
  onBack: () => void
}) {
  const [quotation, setQuotation] = useState<any>(null)
  const [document, setDocument] = useState<V5Document | V6Document | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)

  const [readOnly, setReadOnly] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { toast } = useToast()
  const v5EngineRef = useRef<V5EngineHandle | null>(null)
  const v6EngineRef = useRef<V6EngineHandle | null>(null)
  const [v5UndoRedo, setV5UndoRedo] = useState({ canUndo: false, canRedo: false })
  useFrontendDiagnostics(!readOnly && !loading)

  const { clearRecovery } = useRecovery(quotationId, document)
  useNavigationGuard(dirty)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await GetQuotation(quotationId)
        setQuotation(res)
        if (res.document) {
          const raw = JSON.parse(res.document)
          if (raw?.schema_version !== 5 && raw?.schema_version !== 6) {
            throw new Error('This quotation uses an unsupported document format.')
          }
          // Never replace persisted content silently with a local checkpoint.
          // A stale checkpoint previously made an existing quotation appear empty.
          setDocument(raw)
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
    } else {
      payload = JSON.stringify(docToSave)
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
    setActionBusy(true)
    try {
      await executeSave(document) // ensure latest is saved
      const res = await FinalizeQuotation(quotationId)
      setQuotation(res)
      setReadOnly(true)
      setFinalizeDialogOpen(false)
      toast({ title: 'Quotation Finalized' })
    } catch (err: any) {
      toast({ title: 'Failed to finalize', description: err.toString(), variant: 'destructive' })
    } finally {
      setActionBusy(false)
    }
  }

  const handlePreviewMode = async () => {
    if (readOnly) {
      // Finalized and later statuses are immutable snapshots. Only a draft that was temporarily
      // switched to Preview may return to editing.
      if (quotation.status !== 'DRAFT') return
      setReadOnly(false)
      return
    }
    try {
      // The PDF preview is intentionally rendered from the persisted V5
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

  const { saveState, lastSaved } = useAutosave(
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

  const handleExpectedTotalChange = async (expectedTotal: number | null) => {
    try {
      const res = await UpdateQuotationExpectedTotal({
        id: quotationId,
        expected_total: expectedTotal,
      } as any)
      setQuotation(res)
    } catch (err: any) {
      toast({
        title: 'Failed to save expected total',
        description: err.toString(),
        variant: 'destructive',
      })
    }
  }

  const handleBack = async () => {
    if (leaving) return
    if (!dirty || saveState === 'Saved') {
      onBack()
      return
    }
    setLeaving(true)
    try {
      await executeSave(document)
      setDirty(false)
      onBack()
    } catch (error) {
      toast({
        title: 'Could not leave quotation',
        description: `Your latest changes could not be saved. ${String(error)}`,
        variant: 'destructive',
      })
      setLeaving(false)
    }
  }

  const handleSaveAsTemplate = async () => {
    const name = templateName.trim()
    if (!name) return
    setActionBusy(true)
    try {
      await executeSave(document)
      await SaveAsTemplate({ quotation_id: quotationId, name })
      setTemplateDialogOpen(false)
      setTemplateName('')
      toast({ title: 'Template saved', description: 'The quotation structure is now reusable.' })
    } catch (err: any) {
      toast({ title: 'Could not save template', description: String(err), variant: 'destructive' })
    } finally {
      setActionBusy(false)
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
        onBack={() => void handleBack()}
        readOnly={readOnly}
        onToggleReadOnly={handlePreviewMode}
        onCustomerChange={handleCustomerChange}
        onExpectedTotalChange={handleExpectedTotalChange}
        saveIndicator={<SaveIndicator state={saveState} lastSaved={lastSaved} />}
        undoRedoControls={
          <UndoRedoControls
            onUndo={() =>
              document?.schema_version === 6
                ? v6EngineRef.current?.undo()
                : v5EngineRef.current?.undo()
            }
            onRedo={() =>
              document?.schema_version === 6
                ? v6EngineRef.current?.redo()
                : v5EngineRef.current?.redo()
            }
            canUndo={v5UndoRedo.canUndo}
            canRedo={v5UndoRedo.canRedo}
          />
        }
        onFinalize={() => setFinalizeDialogOpen(true)}
        onSaveAsTemplate={() => {
          setTemplateName(`${quotation.number || 'Quotation'} template`)
          setTemplateDialogOpen(true)
        }}
      />

      <div className="min-h-0 flex flex-1 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          {readOnly ? (
            <Preview
              companyId={quotation.company_id}
              quotationId={quotation.id}
              // eslint-disable-next-line react/purity
              version={lastSaved ? lastSaved.getTime() : new Date().getTime()}
            />
          ) : document?.schema_version === 6 ? (
            <V6BuilderEngine
              document={document as V6Document}
              exportName={quotation.number || 'quotation'}
              onReady={(handle) => {
                v6EngineRef.current = handle
              }}
              onChange={(newDoc) => {
                setDocument(newDoc)
                setDirty(true)
                setV5UndoRedo({
                  canUndo: v6EngineRef.current?.canUndo() ?? false,
                  canRedo: v6EngineRef.current?.canRedo() ?? false,
                })
              }}
              resolvePageMap={async (doc) =>
                GetDocumentLayoutDiagnostics(
                  quotation.company_id,
                  quotation.id,
                  JSON.stringify(doc),
                ) as any
              }
            />
          ) : document ? (
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
          ) : null}
        </div>
      </div>
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Save the current quotation layout as a reusable template. Customer and quotation
              records remain independent.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm font-medium">
            Template name
            <Input
              autoFocus
              value={templateName}
              maxLength={120}
              onChange={(event) => setTemplateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && templateName.trim() && !actionBusy)
                  void handleSaveAsTemplate()
              }}
            />
          </label>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              variant="outline"
              onClick={() => setTemplateDialogOpen(false)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSaveAsTemplate()}
              disabled={!templateName.trim() || actionBusy}
            >
              {actionBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Finalize quotation?</DialogTitle>
            <DialogDescription>
              Finalizing creates immutable document and company/customer snapshots. The quotation
              will become read-only.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              variant="outline"
              onClick={() => setFinalizeDialogOpen(false)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleFinalize()} disabled={actionBusy}>
              {actionBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Finalize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

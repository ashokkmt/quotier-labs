import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { 
  GetQuotation, 
  SaveQuotationDocument, 
  UpdateQuotationCustomer 
} from "../../../wailsjs/go/wails/QuotationHandler"
import { BuilderHeader } from "./BuilderHeader"
import { DocumentCanvas } from "./DocumentCanvas"
import { CalculationDisplay } from "./CalculationDisplay"
import { useUndoRedo } from "./hooks/useUndoRedo"
import { useAutosave } from "./hooks/useAutosave"
import { useRecovery } from "./hooks/useRecovery"
import { useNavigationGuard } from "../../shared/hooks/useNavigationGuard"
import { SnapshotCommand } from "./commands/base"
import { UndoRedoControls } from "./components/UndoRedoControls"
import { SaveIndicator } from "./components/SaveIndicator"
import { RecalculateQuotation } from "../../../wailsjs/go/wails/QuotationHandler"

export function QuotationBuilder({ quotationId, onBack }: { quotationId: string, onBack: () => void }) {
  const [quotation, setQuotation] = useState<any>(null)
  const { state: document, setState: setDocument, applyCommand, undo, redo, canUndo, canRedo, dirty, setDirty } = useUndoRedo(null)
  const [calculationResult, setCalculationResult] = useState<any>(null)
  const [, setRecalculating] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const [readOnly, setReadOnly] = useState(false)
  const { toast } = useToast()

  const { checkRecovery, clearRecovery } = useRecovery(quotationId, document)
  useNavigationGuard(dirty)


  useEffect(() => {
    const load = async () => {
      try {
        const res = await GetQuotation(quotationId)
        setQuotation(res)
        if (res.document) {
          const parsed = JSON.parse(res.document)
          const recovery = checkRecovery()
          // In a real app we'd ask user, here we just restore it if it's there
          if (recovery && recovery.document) {
            setDocument(recovery.document)
            setDirty(true)
            toast({ title: "Draft recovered", description: "Unsaved changes were restored." })
          } else {
            setDocument(parsed)
          }
        }
        if (res.status !== 'DRAFT') setReadOnly(true)
        if (res.subtotal !== undefined) setCalculationResult(res)
      } catch (err: any) {
        toast({ title: "Failed to load quotation", description: err.toString(), variant: "destructive" })
        onBack()
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [quotationId])

  
  const executeSave = async (docToSave: any) => {
    if (!docToSave) return
    const res = await SaveQuotationDocument({ id: quotationId, document: JSON.stringify(docToSave) })
    setQuotation(res)
    clearRecovery()
    await handleRecalculate()
  }

  const { saveState, lastSaved, forceSave } = useAutosave(document, dirty, executeSave, () => setDirty(false), 800)


  
  const handleRecalculate = async () => {
    setRecalculating(true)
    try {
      const res = await RecalculateQuotation(quotationId)
      setCalculationResult(res)
    } catch (err: any) {
      toast({ title: "Recalculation failed", description: err.toString(), variant: "destructive" })
    } finally {
      setRecalculating(false)
    }
  }

  const handleCustomerChange = async (customerId: string) => {
    try {
      const res = await UpdateQuotationCustomer({
        id: quotationId,
        customer_id: customerId
      })
      setQuotation(res)
      toast({ title: "Customer updated" })
      await handleRecalculate()
    } catch (err: any) {
      toast({ title: "Failed to update customer", description: err.toString(), variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-muted/20">
      <BuilderHeader 
        quotation={quotation} 
        onBack={onBack}
        onSave={forceSave}
        saving={saveState === "Saving..."}
        readOnly={readOnly}
        onToggleReadOnly={() => setReadOnly(!readOnly)}
        onCustomerChange={handleCustomerChange}
        saveIndicator={<SaveIndicator state={saveState} lastSaved={lastSaved} />}
        undoRedoControls={<UndoRedoControls onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} />}
      />
      
      <div className="flex-1 overflow-y-auto p-6 flex gap-6">
        <div className="flex-1">
        <DocumentCanvas 
          document={document} 
          onChange={(newDoc: any) => applyCommand(new SnapshotCommand(document, newDoc, "Edit"))}
          readOnly={readOnly}
        />
        </div>
        <div className="w-[300px] hidden lg:block">
          <CalculationDisplay result={calculationResult} />
        </div>
      </div>
    </div>
  )
}

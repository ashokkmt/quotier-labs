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
import { RecalculateQuotation } from "../../../wailsjs/go/wails/QuotationHandler"

export function QuotationBuilder({ quotationId, onBack }: { quotationId: string, onBack: () => void }) {
  const [quotation, setQuotation] = useState<any>(null)
  const [document, setDocument] = useState<any>(null)
  const [calculationResult, setCalculationResult] = useState<any>(null)
  const [, setRecalculating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const res = await GetQuotation(quotationId)
        setQuotation(res)
        if (res.document) setDocument(JSON.parse(res.document))
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

  const handleSave = async () => {
    if (!document) return
    setSaving(true)
    try {
      const res = await SaveQuotationDocument({
        id: quotationId,
        document: JSON.stringify(document)
      })
      setQuotation(res)
      toast({ title: "Draft saved successfully" })
      await handleRecalculate()
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.toString(), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  
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
        onSave={handleSave}
        saving={saving}
        readOnly={readOnly}
        onToggleReadOnly={() => setReadOnly(!readOnly)}
        onCustomerChange={handleCustomerChange}
      />
      
      <div className="flex-1 overflow-y-auto p-6 flex gap-6">
        <div className="flex-1">
        <DocumentCanvas 
          document={document} 
          onChange={setDocument}
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

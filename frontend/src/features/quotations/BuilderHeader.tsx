import { ArrowLeft, Save, Loader2, Eye, Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "./components/StatusBadge"
import { PDFActions } from "./components/PDFActions"
import { CustomerCombobox } from "../../shared/components/CustomerCombobox"

export function BuilderHeader({ 
  quotation, 
  onBack, 
  onSave, 
  saving, 
  readOnly, 
  onToggleReadOnly,
  onCustomerChange,
  saveIndicator,
  undoRedoControls,
  onFinalize,
  onStatusChange
}: any) {
  if (!quotation) return null

  return (
    <div className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-4 flex-1">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="h-6 w-px bg-border" />
        <div>
          <div className="flex items-center gap-2">
        {undoRedoControls}
        {saveIndicator}
            <h2 className="font-bold text-lg">{quotation.number || "Draft"}</h2>
            <StatusBadge status={quotation.status} />
          </div>
        </div>
        <div className="h-6 w-px bg-border ml-2" />
        <div className="w-[300px] ml-2">
          {readOnly ? (
            <div className="text-sm font-medium">Customer ID: {quotation.customer_id}</div> // Simplified for view mode
          ) : (
            <CustomerCombobox 
              value={quotation.customer_id} 
              onChange={onCustomerChange} 
            />
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToggleReadOnly}>
          {readOnly ? (
            <><Edit2 className="w-4 h-4 mr-2" /> Edit Mode</>
          ) : (
            <><Eye className="w-4 h-4 mr-2" /> Preview</>
          )}
        </Button>
        
        {!readOnly && (
          <>
            <Button variant="default" size="sm" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Draft
            </Button>
            <Button variant="secondary" size="sm" onClick={onFinalize}>
              Finalize
            </Button>
          </>
        )}
        {readOnly && quotation.status !== 'DRAFT' && (
          <PDFActions companyId={quotation.company_id} quotationId={quotation.id} status={quotation.status} />
        )}
        {readOnly && quotation.status === 'FINALIZED' && (
          <Button variant="secondary" size="sm" onClick={() => onStatusChange('SENT')}>
            Mark Sent
          </Button>
        )}
        {readOnly && quotation.status === 'SENT' && (
          <>
            <Button variant="default" size="sm" onClick={() => onStatusChange('ACCEPTED')}>
              Mark Accepted
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onStatusChange('REJECTED')}>
              Mark Rejected
            </Button>
          </>
        )}

      </div>
    </div>
  )
}

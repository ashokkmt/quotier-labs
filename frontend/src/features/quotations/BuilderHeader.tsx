import { ArrowLeft, Save, Loader2, Eye, Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  undoRedoControls
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
            <Badge variant={quotation.status === 'DRAFT' ? 'secondary' : 'default'}>{quotation.status}</Badge>
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
          <Button variant="default" size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Draft
          </Button>
        )}
      </div>
    </div>
  )
}

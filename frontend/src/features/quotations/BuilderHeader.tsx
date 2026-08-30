import { ArrowLeft, Save, Loader2, Eye, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from './components/StatusBadge'
import { ExportActions } from './components/ExportActions'
import { CustomerCombobox } from '../../shared/components/CustomerCombobox'

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
  onStatusChange,
  onSaveAsTemplate,
}: any) {
  if (!quotation) return null

  return (
    <div className="sticky top-0 z-30 flex max-h-[42vh] flex-wrap items-center gap-2 overflow-y-auto border-b bg-background p-2 shadow-sm sm:p-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <div className="hidden h-6 w-px bg-border sm:block" />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {undoRedoControls}
            {saveIndicator}
            <h2 className="max-w-48 truncate text-sm font-bold sm:text-lg">
              {quotation.number || 'Draft'}
            </h2>
            <StatusBadge status={quotation.status} />
          </div>
        </div>
        <div className="hidden h-6 w-px bg-border lg:block" />
        <div className="order-last w-full min-w-0 sm:w-64 lg:order-none lg:w-[300px]">
          {readOnly ? (
            <div className="text-sm font-medium">Customer ID: {quotation.customer_id}</div> // Simplified for view mode
          ) : (
            <CustomerCombobox value={quotation.customer_id} onChange={onCustomerChange} />
          )}
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onToggleReadOnly} className="shrink-0">
          {readOnly ? (
            <>
              <Edit2 className="w-4 h-4 mr-2" /> Edit Mode
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 mr-2" /> Preview
            </>
          )}
        </Button>

        {!readOnly && (
          <>
            <Button variant="outline" size="sm" onClick={onSaveAsTemplate}>
              Save as Template
            </Button>
            <Button variant="default" size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Draft
            </Button>
            <Button variant="secondary" size="sm" onClick={onFinalize}>
              Finalize
            </Button>
          </>
        )}
        {readOnly && quotation.status !== 'DRAFT' && (
          <ExportActions
            companyId={quotation.company_id}
            quotationId={quotation.id}
            status={quotation.status}
          />
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

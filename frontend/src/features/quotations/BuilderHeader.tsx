import {
  ArrowLeft,
  Save,
  Loader2,
  Eye,
  Edit2,
  MoreHorizontal,
  FilePlus2,
  Lock,
  Send,
  Check,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

  const customerControl = readOnly ? (
    <div className="truncate text-sm font-medium" title={quotation.customer_id}>
      Customer ID: {quotation.customer_id}
    </div>
  ) : (
    <CustomerCombobox value={quotation.customer_id} onChange={onCustomerChange} />
  )

  return (
    <header className="sticky top-0 z-30 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-background p-2 shadow-sm sm:px-3">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-9 w-9 shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="hidden shrink-0 sm:block">{undoRedoControls}</div>
        <div className="hidden shrink-0 md:block">{saveIndicator}</div>
        <h2
          className="hidden min-w-0 max-w-36 truncate text-sm font-bold sm:block lg:max-w-48 lg:text-base"
          title={quotation.number || 'Draft'}
        >
          {quotation.number || 'Draft'}
        </h2>
        <StatusBadge status={quotation.status} />
        <div className="ml-2 hidden min-w-48 max-w-[300px] flex-1 xl:block">{customerControl}</div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
        {(!readOnly || quotation.status === 'DRAFT') && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleReadOnly}
            className="shrink-0 px-2 lg:px-3"
            aria-label={readOnly ? 'Edit mode' : 'Preview'}
          >
            {readOnly ? (
              <>
                <Edit2 className="h-4 w-4 lg:mr-2" />{' '}
                <span className="hidden lg:inline">Edit Mode</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 lg:mr-2" />{' '}
                <span className="hidden lg:inline">Preview</span>
              </>
            )}
          </Button>
        )}

        {!readOnly && (
          <>
            <Button
              className="hidden 2xl:inline-flex"
              variant="outline"
              size="sm"
              onClick={onSaveAsTemplate}
            >
              Save as Template
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onSave}
              disabled={saving}
              className="px-2 lg:px-3"
              aria-label="Save draft"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin lg:mr-2" />
              ) : (
                <Save className="h-4 w-4 lg:mr-2" />
              )}
              <span className="hidden lg:inline">Save Draft</span>
            </Button>
            <Button
              className="hidden 2xl:inline-flex"
              variant="secondary"
              size="sm"
              onClick={onFinalize}
            >
              Finalize
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="2xl:hidden"
                  variant="outline"
                  size="icon"
                  aria-label="More quotation actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onSaveAsTemplate}>
                  <FilePlus2 className="mr-2 h-4 w-4" /> Save as Template
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onFinalize}>
                  <Lock className="mr-2 h-4 w-4" /> Finalize
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {readOnly && quotation.status !== 'DRAFT' && (
          <>
            <div className="2xl:hidden">
              <ExportActions
                compact
                companyId={quotation.company_id}
                quotationId={quotation.id}
                status={quotation.status}
              />
            </div>
            <div className="hidden 2xl:block">
              <ExportActions
                companyId={quotation.company_id}
                quotationId={quotation.id}
                status={quotation.status}
              />
            </div>
          </>
        )}
        {readOnly && quotation.status === 'FINALIZED' && (
          <Button
            className="hidden 2xl:inline-flex"
            variant="secondary"
            size="sm"
            onClick={() => onStatusChange('SENT')}
          >
            Mark Sent
          </Button>
        )}
        {readOnly && quotation.status === 'SENT' && (
          <div className="hidden gap-2 2xl:flex">
            <Button variant="default" size="sm" onClick={() => onStatusChange('ACCEPTED')}>
              Mark Accepted
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onStatusChange('REJECTED')}>
              Mark Rejected
            </Button>
          </div>
        )}
        {readOnly && ['FINALIZED', 'SENT'].includes(quotation.status) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="2xl:hidden"
                variant="outline"
                size="icon"
                aria-label="More status actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {quotation.status === 'FINALIZED' && (
                <DropdownMenuItem onSelect={() => onStatusChange('SENT')}>
                  <Send className="mr-2 h-4 w-4" /> Mark Sent
                </DropdownMenuItem>
              )}
              {quotation.status === 'SENT' && (
                <>
                  <DropdownMenuItem onSelect={() => onStatusChange('ACCEPTED')}>
                    <Check className="mr-2 h-4 w-4" /> Mark Accepted
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onStatusChange('REJECTED')}>
                    <X className="mr-2 h-4 w-4" /> Mark Rejected
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="col-span-2 min-w-0 xl:hidden">{customerControl}</div>
    </header>
  )
}

import { useState } from 'react'
import { ArrowLeft, Eye, Edit2, MoreHorizontal, FilePlus2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  readOnly,
  onToggleReadOnly,
  onCustomerChange,
  onExpectedTotalChange,
  saveIndicator,
  undoRedoControls,
  onFinalize,
  onSaveAsTemplate,
}: any) {
  if (!quotation) return null

  const customerControl = readOnly ? (
    <div className="truncate text-sm font-medium" title={quotation.customer_id || 'No customer'}>
      {quotation.customer_id ? `Customer ID: ${quotation.customer_id}` : 'No customer selected'}
    </div>
  ) : (
    <CustomerCombobox value={quotation.customer_id} onChange={onCustomerChange} />
  )
  const amountControl = (
    <ExpectedTotalInput
      value={quotation.expected_total}
      readOnly={readOnly}
      onCommit={onExpectedTotalChange}
    />
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
        <div className="ml-2 hidden min-w-0 flex-1 items-center gap-2 xl:flex">
          <div className="min-w-48 max-w-[300px] flex-1">{customerControl}</div>
          {amountControl}
        </div>
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
      </div>
      <div className="col-span-2 flex min-w-0 gap-2 xl:hidden">
        <div className="min-w-0 flex-1">{customerControl}</div>
        {amountControl}
      </div>
    </header>
  )
}

function ExpectedTotalInput({
  value,
  readOnly,
  onCommit,
}: {
  value?: number | null
  readOnly: boolean
  onCommit: (value: number | null) => void | Promise<void>
}) {
  const formatted = value == null ? '' : (value / 100).toFixed(2)
  const [draft, setDraft] = useState(formatted)

  if (readOnly) {
    return (
      <div className="min-w-32 rounded-md border bg-muted/30 px-3 py-2 text-sm tabular-nums">
        {value == null ? 'No estimate' : `₹${formatted}`}
      </div>
    )
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      if (value != null) void onCommit(null)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDraft(formatted)
      return
    }
    const minorUnits = Math.round(parsed * 100)
    setDraft((minorUnits / 100).toFixed(2))
    if (minorUnits !== value) void onCommit(minorUnits)
  }

  return (
    <div className="relative w-40 shrink-0">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₹
      </span>
      <Input
        aria-label="Expected quotation total"
        inputMode="decimal"
        placeholder="Expected total"
        className="pl-7 tabular-nums"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(formatted)
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

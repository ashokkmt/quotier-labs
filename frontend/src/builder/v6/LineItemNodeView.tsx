import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { AppSelect } from '@/components/ui/select'
import { BoundedNumberInput } from './BoundedNumberInput'
import { V6_LINE_ITEM_COLUMNS, nodeID } from './model'
import { calculateAdvisoryTotals, type AdvisoryLineItem } from './lineItemCalculation'

type Row = AdvisoryLineItem
type Column = { key: (typeof V6_LINE_ITEM_COLUMNS)[number]; label?: string; width?: number }
const defaultColumns: Column[] = [
  { key: 'description', label: 'Description' },
  { key: 'quantity', label: 'Qty' },
  { key: 'rate', label: 'Rate ₹' },
  { key: 'tax_rate', label: 'Tax %' },
  { key: 'amount', label: 'Amount ₹' },
]

export function LineItemNodeView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const rows = (node.attrs.rows ?? []) as Row[]
  const columns = (node.attrs.columns?.length ? node.attrs.columns : defaultColumns) as Column[]
  const totals = calculateAdvisoryTotals(rows)
  const update = (index: number, patch: Partial<Row>) =>
    updateAttributes({ rows: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) })
  return (
    <NodeViewWrapper
      data-v6-line-items=""
      className={`my-4 overflow-x-auto rounded-lg border bg-background ${selected ? 'ring-2 ring-primary' : ''}`}
      style={{
        width: node.attrs.width ? `${Number(node.attrs.width) / 75}px` : '100%',
        marginLeft:
          node.attrs.alignment === 'center' || node.attrs.alignment === 'right'
            ? 'auto'
            : undefined,
        marginRight: node.attrs.alignment === 'center' ? 'auto' : undefined,
      }}
    >
      <table className="w-full min-w-[680px] text-sm">
        <thead style={{ backgroundColor: node.attrs.header_background || '#E5E7EB' }}>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="p-2 text-left">
                {column.label || labelFor(column.key)}
              </th>
            ))}
            <th className="p-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="border-t">
              {columns.map((column) => (
                <td key={column.key} className="p-1">
                  {lineItemCell(row, index, column.key, update, totals.lines[index])}
                </td>
              ))}
              <td className="p-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() => updateAttributes({ rows: rows.filter((_, i) => i !== index) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        className="flex flex-wrap justify-end gap-4 border-t bg-muted/30 px-3 py-2 text-xs"
        aria-label="Advisory totals"
      >
        {node.attrs.show_subtotal && <span>Subtotal: {money(totals.subtotal)}</span>}
        {node.attrs.show_discount && <span>Discount: {money(totals.discount)}</span>}
        {node.attrs.show_tax && <span>Tax: {money(totals.tax)}</span>}
        <strong>Grand total: {money(totals.grand)}</strong>
        <span className="text-muted-foreground">Advisory until saved</span>
      </div>
      <details className="border-t px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium">Line-item table settings</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1">
            Table alignment
            <AppSelect
              label="Line-item table alignment"
              value={node.attrs.alignment || 'left'}
              options={['left', 'center', 'right'].map((value) => ({
                value,
                label: value[0].toUpperCase() + value.slice(1),
              }))}
              onValueChange={(alignment) => updateAttributes({ alignment })}
            />
          </label>
          <label className="grid gap-1">
            Table width (mm)
            <BoundedNumberInput
              label="Line-item table width in millimetres"
              min={40}
              max={190}
              value={Math.round(Number(node.attrs.width || 45128) / 283.465)}
              onCommit={(value) => updateAttributes({ width: Math.round(value * 283.465) })}
            />
          </label>
          <label className="grid gap-1 sm:col-span-2">
            Header background
            <AppSelect
              label="Line-item header background"
              value={node.attrs.header_background || '#E5E7EB'}
              options={[
                { value: '#E5E7EB', label: 'Light gray' },
                { value: '#DBEAFE', label: 'Light blue' },
                { value: '#FEF3C7', label: 'Light yellow' },
                { value: '#FFFFFF', label: 'White' },
              ]}
              onValueChange={(header_background) => updateAttributes({ header_background })}
            />
          </label>
          {V6_LINE_ITEM_COLUMNS.map((key) => {
            const column = columns.find((item) => item.key === key)
            return (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  aria-label={`Show ${labelFor(key)} column`}
                  checked={Boolean(column)}
                  disabled={Boolean(column) && columns.length === 1}
                  onCheckedChange={(checked) =>
                    updateAttributes({
                      columns: checked
                        ? [...columns, { key, label: labelFor(key) }]
                        : columns.filter((item) => item.key !== key),
                    })
                  }
                />
                <Input
                  aria-label={`${labelFor(key)} column label`}
                  className="h-8"
                  disabled={!column}
                  value={column?.label || labelFor(key)}
                  maxLength={80}
                  onChange={(event) =>
                    updateAttributes({
                      columns: columns.map((item) =>
                        item.key === key ? { ...item, label: event.target.value } : item,
                      ),
                    })
                  }
                />
              </div>
            )
          })}
          {(['show_subtotal', 'show_discount', 'show_tax', 'show_grand_total'] as const).map(
            (key) => (
              <label key={key} className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(node.attrs[key])}
                  onCheckedChange={(checked) => updateAttributes({ [key]: checked === true })}
                />
                {key.replace('show_', '').replace('_', ' ')}
              </label>
            ),
          )}
        </div>
      </details>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="m-2"
        onClick={() => updateAttributes({ rows: [...rows, blankRow()] })}
      >
        <Plus className="mr-2 h-4 w-4" /> Add item
      </Button>
    </NodeViewWrapper>
  )
}

function lineItemCell(
  row: Row,
  index: number,
  key: Column['key'],
  update: (index: number, patch: Partial<Row>) => void,
  result: { taxable: number; tax: number; amount: number },
) {
  if (key === 'description')
    return (
      <Input
        aria-label={`Item ${index + 1} description`}
        value={row.description}
        maxLength={500}
        onChange={(event) => update(index, { description: event.target.value })}
      />
    )
  if (key === 'quantity')
    return (
      <NumberCell
        label={`Item ${index + 1} quantity`}
        value={row.quantity}
        onChange={(quantity) => update(index, { quantity })}
      />
    )
  if (key === 'rate')
    return (
      <MoneyCell
        label={`Item ${index + 1} rate`}
        value={row.rate}
        onChange={(rate) => update(index, { rate })}
      />
    )
  if (key === 'discount')
    return (
      <MoneyCell
        label={`Item ${index + 1} discount`}
        value={row.discount}
        onChange={(discount) => update(index, { discount })}
      />
    )
  if (key === 'tax_rate')
    return (
      <div className="flex items-center gap-1">
        <NumberCell
          label={`Item ${index + 1} tax rate`}
          value={row.tax_rate}
          onChange={(tax_rate) => update(index, { tax_rate })}
        />
        <label className="flex items-center gap-1 whitespace-nowrap">
          <Checkbox
            checked={row.tax_inclusive}
            onCheckedChange={(checked) => update(index, { tax_inclusive: checked === true })}
          />
          Inclusive
        </label>
      </div>
    )
  return (
    <span className="block px-2 py-2 text-right">
      {money(key === 'taxable' ? result.taxable : key === 'tax' ? result.tax : result.amount)}
    </span>
  )
}

const labelFor = (key: Column['key']) =>
  ({
    description: 'Description',
    quantity: 'Qty',
    rate: 'Rate ₹',
    discount: 'Discount ₹',
    tax_rate: 'Tax %',
    taxable: 'Taxable ₹',
    tax: 'Tax ₹',
    amount: 'Amount ₹',
  })[key]
const money = (minor: number) => `₹${(minor / 100).toFixed(2)}`

const blankRow = (): Row => ({
  id: nodeID(),
  description: '',
  quantity: 1,
  rate: 0,
  discount: 0,
  tax_rate: 18,
  tax_inclusive: false,
})
function NumberCell({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Input
      aria-label={label}
      type="number"
      min={0}
      step="any"
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
    />
  )
}
function MoneyCell({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Input
      aria-label={label}
      type="number"
      min={0}
      step="0.01"
      value={(value / 100).toFixed(2)}
      onChange={(e) => onChange(Math.max(0, Math.round((Number(e.target.value) || 0) * 100)))}
    />
  )
}

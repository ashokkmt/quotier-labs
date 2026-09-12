import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2 } from 'lucide-react'
import { nodeID } from './model'

type Row = {
  id: string
  description: string
  quantity: number
  rate: number
  discount: number
  tax_rate: number
  tax_inclusive: boolean
}

export function LineItemNodeView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const rows = (node.attrs.rows ?? []) as Row[]
  const update = (index: number, patch: Partial<Row>) =>
    updateAttributes({ rows: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) })
  return (
    <NodeViewWrapper
      data-v6-line-items=""
      className={`my-4 overflow-x-auto rounded-lg border bg-background ${selected ? 'ring-2 ring-primary' : ''}`}
    >
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-muted">
          <tr>
            {['Description', 'Qty', 'Rate ₹', 'Discount ₹', 'Tax %', ''].map((h) => (
              <th key={h} className="p-2 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="border-t">
              <td className="p-1">
                <Input
                  aria-label={`Item ${index + 1} description`}
                  value={row.description}
                  onChange={(e) => update(index, { description: e.target.value })}
                />
              </td>
              <td className="p-1">
                <NumberCell
                  label={`Item ${index + 1} quantity`}
                  value={row.quantity}
                  onChange={(quantity) => update(index, { quantity })}
                />
              </td>
              <td className="p-1">
                <MoneyCell
                  label={`Item ${index + 1} rate`}
                  value={row.rate}
                  onChange={(rate) => update(index, { rate })}
                />
              </td>
              <td className="p-1">
                <MoneyCell
                  label={`Item ${index + 1} discount`}
                  value={row.discount}
                  onChange={(discount) => update(index, { discount })}
                />
              </td>
              <td className="p-1">
                <NumberCell
                  label={`Item ${index + 1} tax rate`}
                  value={row.tax_rate}
                  onChange={(tax_rate) => update(index, { tax_rate })}
                />
              </td>
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

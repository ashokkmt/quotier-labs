import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SelectImage } from '../../../wailsjs/go/wails/CompanyHandler'
import type { BuilderNode } from '../document/model'
import type { SchemaField } from '../registry/types'
import { getWidget } from '../registry/registry'

const tokenOptions = {
  spacing: [
    ['none', 'None'],
    ['xs', 'Extra small'],
    ['sm', 'Small'],
    ['md', 'Medium'],
    ['lg', 'Large'],
  ],
  color: [
    ['default', 'Default'],
    ['muted', 'Muted'],
    ['primary', 'Primary'],
    ['success', 'Success'],
    ['danger', 'Danger'],
  ],
  typography: [
    ['xs', 'Extra small'],
    ['sm', 'Small'],
    ['md', 'Body'],
    ['lg', 'Large'],
    ['xl', 'Heading'],
    ['2xl', 'Display'],
  ],
  border: [
    ['normal', 'Normal'],
    ['medium', 'Medium'],
    ['semibold', 'Semibold'],
    ['bold', 'Bold'],
  ],
  align: [
    ['left', 'Left'],
    ['center', 'Centre'],
    ['right', 'Right'],
  ],
  density: [
    ['tight', 'Tight'],
    ['normal', 'Normal'],
    ['relaxed', 'Relaxed'],
  ],
  width: [],
} as const

export function Inspector({
  node,
  onUpdate,
}: {
  node: BuilderNode | null
  onUpdate: (key: string, value: unknown) => void
}) {
  if (!node)
    return (
      <aside className="w-64 border-l p-4 text-sm text-muted-foreground">
        Select an element to inspect it.
      </aside>
    )
  const definition = getWidget(node.type)
  const fields = [...(definition?.propSchema ?? []), ...(definition?.layoutSchema ?? [])].filter(
    (field) => field.key !== 'value',
  )
  return (
    <aside className="w-64 border-l p-4 space-y-4" aria-label="Properties">
      <h2 className="font-semibold">{definition?.metadata.label ?? node.type}</h2>
      {fields.map((field) => (
        <InspectorField
          key={field.key}
          field={field}
          value={node.props[field.key] ?? node.layout[field.key as keyof typeof node.layout] ?? ''}
          onChange={(value) => onUpdate(field.key, value)}
        />
      ))}
    </aside>
  )
}

function InspectorField({
  field,
  value,
  onChange,
}: {
  field: SchemaField
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (field.kind === 'select')
    return (
      <div className="block space-y-1">
        <Label>{field.label}</Label>
        <Select value={String(value)} onValueChange={onChange}>
          <SelectTrigger className="w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  if (field.kind === 'boolean')
    return (
      <label className="flex gap-2 items-center text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    )
  if (field.kind === 'image')
    return (
      <div className="block space-y-1">
        <Label>{field.label}</Label>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={async () => {
            const src = await SelectImage('Select image')
            if (src) onChange(src)
          }}
        >
          Choose image
        </Button>
        {value ? <p className="truncate text-xs text-muted-foreground">{String(value)}</p> : null}
      </div>
    )
  if (field.kind === 'token') {
    const options = field.tokenGroup ? tokenOptions[field.tokenGroup] : []
    return (
      <div className="block space-y-1">
        <Label>{field.label}</Label>
        <Select value={String(value)} onValueChange={onChange}>
          <SelectTrigger className="w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(([optionValue, label]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }
  return (
    <label className="block space-y-1">
      <Label>{field.label}</Label>
      <Input
        type={field.kind === 'number' || field.kind === 'currency' ? 'number' : 'text'}
        value={String(value)}
        min={field.key === 'imageWidth' ? 10 : field.key === 'weight' ? 1 : undefined}
        max={field.key === 'imageWidth' ? 100 : field.key === 'weight' ? 12 : undefined}
        onChange={(event) =>
          onChange(
            field.kind === 'number' || field.kind === 'currency'
              ? Number(event.target.value)
              : event.target.value,
          )
        }
      />
    </label>
  )
}

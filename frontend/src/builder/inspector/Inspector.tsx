import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BuilderNode } from '../document/model'
import type { SchemaField } from '../registry/types'
import { getWidget } from '../registry/registry'

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
  const definition = getWidget(node.widget)
  const fields = [...(definition?.propSchema ?? []), ...(definition?.styleSchema ?? [])]
  return (
    <aside className="w-64 border-l p-4 space-y-4" aria-label="Properties">
      <h2 className="font-semibold">{definition?.metadata.label ?? node.widget}</h2>
      {fields.map((field) => (
        <InspectorField
          key={field.key}
          field={field}
          value={node.props[field.key] ?? node.style[field.key as keyof typeof node.style] ?? ''}
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
      <label className="block space-y-1">
        <Label>{field.label}</Label>
        <select
          className="w-full border rounded-md h-9 px-2 text-sm"
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
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
      <label className="block space-y-1">
        <Label>{field.label}</Label>
        <Input
          type="file"
          accept={field.accept?.join(',')}
          onChange={(event) => onChange(event.target.files?.[0]?.name ?? '')}
        />
      </label>
    )
  return (
    <label className="block space-y-1">
      <Label>{field.label}</Label>
      <Input
        type={field.kind === 'number' || field.kind === 'currency' ? 'number' : 'text'}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

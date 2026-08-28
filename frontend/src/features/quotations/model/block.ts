import { z } from 'zod'

export type BlockKind = 'section' | 'row' | 'column'
export type FieldType =
  | 'Heading'
  | 'Text'
  | 'Textarea'
  | 'Number'
  | 'Currency'
  | 'Date'
  | 'Select'
  | 'Boolean'
  | 'Image'
  | 'Computed'
export type WidgetType =
  | 'container'
  | 'heading'
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'boolean'
  | 'image'
  | 'signature'
  | 'stamp'
  | 'divider'
  | 'spacer'
  | 'customer-details'
  | 'company-details'
  | 'quotation-metadata'
  | 'quotation-summary'
  | 'table'
  | 'payment-terms'
  | 'warranty'
  | 'notes'
export type Block = {
  id: string
  kind: BlockKind
  widget_type?: WidgetType
  children: Block[]
  title?: string
  fields?: Field[]
  tables?: Table[]
  section_definition_id?: string
  overrides?: Record<string, unknown>
  settings?: Record<string, unknown>
  layout?: {
    direction?: 'vertical' | 'horizontal'
    width?: number
    height?: number
    gap?: number
    padding?: number
    align?: string
    justify?: string
  }
  width?: '100%' | '50%' | '33%' | '66%'
  visible: boolean
  optional: boolean
}
export type Field = {
  id: string
  label: string
  type: FieldType | string
  required: boolean
  value?: unknown
  config?: Record<string, unknown>
}
export type Table = {
  id: string
  name: string
  columns: Array<{ id: string; label: string; type: string; formula?: string; width?: string }>
  rows: Array<Record<string, unknown>>
  has_totals: boolean
  totals_config?: Record<string, unknown>
}
export type DocumentModel = { schema_version: number; children: Block[] }

const tableSchema = z.object({
  id: z.string(),
  name: z.string(),
  columns: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: z.string(),
      formula: z.string().optional(),
      width: z.string().optional(),
    }),
  ),
  rows: z.array(z.record(z.unknown())),
  has_totals: z.boolean(),
  totals_config: z.record(z.unknown()).optional(),
})
export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    kind: z.enum(['section', 'row', 'column']),
    children: z.array(blockSchema),
    title: z.string().max(500).optional(),
    fields: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().max(500),
          type: z.string(),
          required: z.boolean(),
          value: z.unknown().optional(),
          config: z.record(z.unknown()).optional(),
        }),
      )
      .optional(),
    tables: z.array(tableSchema).optional(),
    section_definition_id: z.string().optional(),
    overrides: z.record(z.unknown()).optional(),
    width: z.enum(['100%', '50%', '33%', '66%']).optional(),
    visible: z.boolean(),
    optional: z.boolean(),
  }),
)
export function canContain(parent: BlockKind | 'root', child: BlockKind) {
  return parent === 'root'
    ? child === 'section' || child === 'row'
    : parent === 'section'
      ? child === 'section' || child === 'row'
      : parent === 'row'
        ? child === 'column'
        : child === 'section' || child === 'row'
}
export function validateChildren(
  children: Block[],
  depth = 1,
  ancestors = new Set<string>(),
): string | null {
  if (depth > 8) return 'Nesting cannot exceed 8 levels.'
  for (const block of children) {
    if (ancestors.has(block.id)) return 'A block cannot contain itself.'
    if (
      block.kind !== 'section' &&
      ((block.fields?.length ?? 0) > 0 || (block.tables?.length ?? 0) > 0)
    )
      return 'Fields and tables must be inside a section.'
    const next = new Set(ancestors).add(block.id)
    const reason = validateChildren(block.children, depth + 1, next)
    if (reason) return reason
  }
  return null
}

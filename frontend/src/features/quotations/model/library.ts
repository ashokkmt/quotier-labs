import type { Block, FieldType } from './block'

export type LibraryEntry = {
  label: string
  blockKind?: Block['kind']
  widgetType?: Block['widget_type']
  fieldType?: FieldType
  sectionDefinitionId?: string
  defaultProps?: Record<string, unknown>
}
export const blockLibrary: LibraryEntry[] = [
  ...(['Heading', 'Text', 'Textarea', 'Number', 'Currency', 'Date', 'Image'] as FieldType[]).map(
    (fieldType) => ({
      label: fieldType,
      widgetType: fieldType.toLowerCase() as Block['widget_type'],
      fieldType,
    }),
  ),
  { label: 'Select', widgetType: 'select' },
  { label: 'Boolean', widgetType: 'boolean' },
  { label: 'Signature', widgetType: 'signature' },
  { label: 'Stamp', widgetType: 'stamp' },
  { label: 'Divider', widgetType: 'divider' },
  { label: 'Spacer', widgetType: 'spacer' },
  { label: 'Table', widgetType: 'table', defaultProps: { table: true } },
  { label: 'Container', widgetType: 'container' },
  {
    label: 'Customer Details',
    widgetType: 'customer-details',
    sectionDefinitionId: 'customer-details',
  },
  { label: 'Company Details', widgetType: 'company-details' },
  { label: 'Quotation Metadata', widgetType: 'quotation-metadata' },
  { label: 'Quotation Summary', widgetType: 'quotation-summary' },
  { label: 'Product Table', widgetType: 'table', defaultProps: { table: true } },
  { label: 'Payment Terms', widgetType: 'payment-terms' },
  { label: 'Warranty', widgetType: 'warranty' },
  { label: 'Notes', widgetType: 'notes' },
]
export function createLibraryBlock(entry: LibraryEntry, id = crypto.randomUUID()): Block {
  const widgetType = entry.widgetType ?? 'container'
  const block: Block = {
    id,
    kind: 'section',
    widget_type: widgetType,
    children: [],
    visible: true,
    optional: false,
    settings: { ...(entry.defaultProps ?? {}) },
    layout: { direction: 'vertical', gap: 12, padding: 12 },
  }
  if (entry.fieldType)
    block.settings = { ...block.settings, value: '', field_type: entry.fieldType }
  if (entry.sectionDefinitionId) block.section_definition_id = entry.sectionDefinitionId
  return block
}

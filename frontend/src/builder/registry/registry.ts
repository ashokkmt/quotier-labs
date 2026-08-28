import type { BuilderNode, NodeRole } from '../document/model'
import type { WidgetDefinition } from './types'

const definitions = new Map<string, WidgetDefinition>()

export function registerWidget(definition: WidgetDefinition) {
  definitions.set(definition.type, definition)
}
export function getWidget(type: string) {
  return definitions.get(type)
}
export function listWidgets() {
  return [...definitions.values()]
}
export function canParent(definition: WidgetDefinition, parentRole: NodeRole): boolean {
  return (
    definition.capabilities.allowedParents === '*' ||
    definition.capabilities.allowedParents.includes(parentRole)
  )
}

const base = (
  type: string,
  label: string,
  role: WidgetDefinition['role'],
  category: WidgetDefinition['category'],
  output: WidgetDefinition['render'],
  horizontal = true,
): WidgetDefinition => ({
  type,
  category,
  role,
  metadata: { label },
  defaults: () => ({ props: {}, layout: {}, meta: {} }),
  propSchema: [],
  layoutSchema: [],
  capabilities: { allowedParents: '*', horizontal },
  render: output,
})

for (const type of [
  'heading',
  'text',
  'textarea',
  'number',
  'currency',
  'date',
  'select',
  'boolean',
]) {
  const def = base(
    `field.${type}`,
    type[0].toUpperCase() + type.slice(1),
    'widget',
    'field',
    (node: BuilderNode) => ({ role: 'content', text: String(node.props.value ?? '') }),
  )
  def.defaults = () => ({ props: { value: '' }, layout: {}, meta: {} })
  def.propSchema = [
    {
      key: 'value',
      kind:
        type === 'textarea'
          ? 'textarea'
          : type === 'number' || type === 'currency'
            ? 'number'
            : 'text',
      label: 'Value',
    },
  ]
  registerWidget(def)
}

const container = base('container', 'Container', 'container', 'structure', () => ({
  role: 'container',
}))
container.defaults = () => ({
  props: {},
  layout: { direction: 'vertical', gap: 'md', padding: 'sm' },
  meta: {},
})
container.layoutSchema = [
  {
    key: 'direction',
    kind: 'select',
    label: 'Direction',
    options: [
      { value: 'vertical', label: 'Vertical' },
      { value: 'horizontal', label: 'Horizontal' },
    ],
  },
  { key: 'gap', kind: 'token', label: 'Gap', tokenGroup: 'spacing' },
  { key: 'padding', kind: 'token', label: 'Padding', tokenGroup: 'spacing' },
]
registerWidget(container)

for (const type of [
  'image',
  'divider',
  'spacer',
  'table',
  'signature',
  'stamp',
  'customer-details',
  'company-details',
  'quotation-metadata',
  'payment-terms',
  'warranty',
  'notes',
  'quotation-summary',
]) {
  const role =
    type === 'table'
      ? 'table'
      : type === 'divider'
        ? 'divider'
        : type === 'image'
          ? 'media'
          : 'content'
  const category =
    type === 'table' || type === 'divider' || type === 'spacer' || type === 'image'
      ? 'content'
      : 'builtin-section'
  const def = base(
    type,
    type.replaceAll('-', ' '),
    'widget',
    category,
    (node) => ({ role, text: String(node.props.value ?? '') }),
    type !== 'divider' && type !== 'spacer',
  )
  if (type === 'image') {
    def.defaults = () => ({ props: { value: '' }, layout: {}, meta: {} })
    def.propSchema = [
      {
        key: 'value',
        kind: 'image',
        label: 'Image',
        accept: ['image/png', 'image/jpeg', 'image/webp'],
        maxBytes: 5_000_000,
      },
    ]
  }
  registerWidget(def)
}

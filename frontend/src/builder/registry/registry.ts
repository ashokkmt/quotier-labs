import type { BuilderNode } from '../document/model'
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
const fieldTypes = [
  'heading',
  'text',
  'textarea',
  'number',
  'currency',
  'date',
  'select',
  'boolean',
  'image',
]
for (const type of fieldTypes)
  registerWidget({
    type: `field.${type}`,
    category: 'field',
    metadata: { label: type[0].toUpperCase() + type.slice(1) },
    defaults: () => ({ props: { value: '' } }),
    propSchema: [
      {
        key: 'value',
        kind:
          type === 'textarea'
            ? 'textarea'
            : type === 'number' || type === 'currency'
              ? 'number'
              : type === 'image'
                ? 'image'
                : 'text',
        label: 'Value',
      },
    ],
    styleSchema: [],
    capabilities: {
      canHaveChildren: false,
      allowedParents: ['root', 'section', 'column'],
      allowedChildren: [],
    },
    render: (node: BuilderNode) => ({
      role: type === 'image' ? 'media' : 'content',
      text: String(node.props.value ?? ''),
    }),
  })
registerWidget({
  type: 'container',
  category: 'structure',
  metadata: { label: 'Container' },
  defaults: () => ({ kind: 'section', children: [], props: { direction: 'vertical' } }),
  propSchema: [
    {
      key: 'direction',
      kind: 'select',
      label: 'Direction',
      options: [
        { value: 'vertical', label: 'Vertical' },
        { value: 'horizontal', label: 'Horizontal' },
      ],
    },
  ],
  styleSchema: [{ key: 'spacing', kind: 'token', label: 'Spacing', tokenGroup: 'spacing' }],
  capabilities: {
    canHaveChildren: true,
    allowedParents: ['root', 'section', 'column'],
    allowedChildren: '*',
  },
  render: () => ({ role: 'container' }),
})
for (const type of [
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
])
  registerWidget({
    type,
    category: type === 'table' ? 'content' : 'builtin-section',
    metadata: { label: type.replaceAll('-', ' ') },
    defaults: () => ({ props: {} }),
    propSchema: [],
    styleSchema: [],
    capabilities: { canHaveChildren: false, allowedParents: '*', allowedChildren: [] },
    render: () => ({
      role: type === 'divider' ? 'divider' : type === 'table' ? 'table' : 'content',
    }),
  })

import type { BuilderNode, NodeKind } from '../document/model'
export type SchemaField = {
  key: string
  kind:
    'text' | 'textarea' | 'number' | 'currency' | 'date' | 'boolean' | 'select' | 'image' | 'token'
  label: string
  options?: Array<{ value: string; label: string }>
  accept?: string[]
  maxBytes?: number
  tokenGroup?: 'spacing' | 'color' | 'typography' | 'border' | 'align' | 'width' | 'density'
}
export type RenderOutput = {
  text?: string
  role: 'container' | 'content' | 'media' | 'table' | 'divider'
}
export type WidgetDefinition = {
  type: string
  category: 'structure' | 'field' | 'content' | 'builtin-section'
  metadata: { label: string; icon?: string; description?: string }
  defaults: () => Partial<BuilderNode>
  propSchema: SchemaField[]
  styleSchema: SchemaField[]
  capabilities: {
    canHaveChildren: boolean
    allowedParents: NodeKind[] | '*'
    allowedChildren: Array<NodeKind | 'field' | 'table'> | '*'
  }
  render: (node: BuilderNode) => RenderOutput
}

import type { BuilderNode, LayoutProps, NodeRole } from '../document/model'
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
  role: Exclude<NodeRole, 'root'>
  defaults: () => {
    props?: Record<string, unknown>
    layout?: LayoutProps
    meta?: Partial<BuilderNode['meta']>
  }
  propSchema: SchemaField[]
  layoutSchema: SchemaField[]
  capabilities: { allowedParents: '*' | NodeRole[]; horizontal: boolean }
  render: (node: BuilderNode) => RenderOutput
}

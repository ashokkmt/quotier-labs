import type { V5LayoutMode, V5Node } from './model'

export type V5Widget = {
  kind: string
  layoutModes: V5LayoutMode[]
  bindingKinds: Array<'literal' | 'company' | 'customer' | 'quotation' | 'calculation'>
  canRotate: boolean
  canGroup: boolean
  maxWidth: number
  maxHeight: number
  goRenderKind: string
}
const widgets: V5Widget[] = [
  {
    kind: 'text',
    layoutModes: ['fixed', 'intrinsic'],
    bindingKinds: ['literal', 'company', 'customer', 'quotation', 'calculation'],
    canRotate: true,
    canGroup: true,
    maxWidth: 56000,
    maxHeight: 80000,
    goRenderKind: 'text',
  },
  {
    kind: 'image',
    layoutModes: ['fixed'],
    bindingKinds: ['literal'],
    canRotate: true,
    canGroup: true,
    maxWidth: 56000,
    maxHeight: 80000,
    goRenderKind: 'image',
  },
  {
    kind: 'table',
    layoutModes: ['fixed', 'flow-frame'],
    bindingKinds: ['literal', 'quotation', 'calculation'],
    canRotate: false,
    canGroup: true,
    maxWidth: 56000,
    maxHeight: 80000,
    goRenderKind: 'table',
  },
  {
    kind: 'flow-frame',
    layoutModes: ['flow-frame'],
    bindingKinds: ['literal', 'quotation'],
    canRotate: false,
    canGroup: false,
    maxWidth: 56000,
    maxHeight: 80000,
    goRenderKind: 'flow-frame',
  },
]
export const getV5Widget = (kind: string) => widgets.find((widget) => widget.kind === kind)
export const listV5Widgets = () => widgets
export function validateNodeContract(node: V5Node): string | null {
  if (node.role === 'group') return null
  const widget = getV5Widget(node.kind)
  if (!widget) return `unknown widget ${node.kind}`
  if (!widget.layoutModes.includes(node.layout_mode))
    return `unsupported layout mode for ${node.kind}`
  if (
    node.binding_kind &&
    !widget.bindingKinds.includes(node.binding_kind as V5Widget['bindingKinds'][number])
  )
    return `unsupported binding for ${node.kind}`
  if (node.geometry.width > widget.maxWidth || node.geometry.height > widget.maxHeight)
    return `widget bounds exceeded for ${node.kind}`
  return null
}
export function validateDocumentContracts(nodes: V5Node[]): string | null {
  for (const node of nodes) {
    const error = validateNodeContract(node)
    if (error) return error
    const childError = validateDocumentContracts(node.children ?? [])
    if (childError) return childError
  }
  return null
}

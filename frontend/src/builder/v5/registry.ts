import type { V5LayoutMode, V5Node } from './model'
import {
  isColorValue,
  V5_FONT_FAMILIES,
  V5_FONT_WEIGHTS,
  V5_SHAPE_VARIANTS,
  V5_STROKE_STYLES,
  V5_TEXT_ALIGNS,
  V5_TEXT_VERTICAL_ALIGNS,
  V5_FONT_SIZE_MIN_PT,
  V5_FONT_SIZE_MAX_PT,
  V5_STROKE_WIDTH_MIN_PT,
  V5_STROKE_WIDTH_MAX_PT,
} from './tokens'

export type V5Widget = {
  kind: string
  layoutModes: V5LayoutMode[]
  bindingKinds: Array<'literal' | 'company' | 'customer' | 'quotation' | 'calculation'>
  canRotate: boolean
  canGroup: boolean
  canResizeX: boolean
  canResizeY: boolean
  aspectPolicy: 'free' | 'preserve-by-default'
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
    canResizeX: true,
    canResizeY: true,
    aspectPolicy: 'free',
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
    canResizeX: true,
    canResizeY: true,
    aspectPolicy: 'preserve-by-default',
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
    canResizeX: true,
    canResizeY: true,
    aspectPolicy: 'free',
    maxWidth: 56000,
    maxHeight: 80000,
    goRenderKind: 'table',
  },
  {
    kind: 'shape',
    layoutModes: ['fixed'],
    bindingKinds: ['literal'],
    canRotate: true,
    canGroup: true,
    canResizeX: true,
    canResizeY: true,
    aspectPolicy: 'free',
    maxWidth: 56000,
    maxHeight: 80000,
    goRenderKind: 'shape',
  },
  {
    kind: 'flow-frame',
    layoutModes: ['flow-frame'],
    bindingKinds: ['literal', 'quotation'],
    canRotate: false,
    canGroup: false,
    canResizeX: true,
    canResizeY: true,
    aspectPolicy: 'free',
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
  return validateControlledProps(node)
}

/** Props are controlled tokens/enums; arbitrary strings would leak into the PDF renderer. */
function validateControlledProps(node: V5Node): string | null {
  const props = (node.props ?? {}) as Record<string, unknown>
  if (node.kind === 'text') {
    if (props.text !== undefined && typeof props.text !== 'string') return 'text must be a string'
    if (props.fontSize !== undefined) {
      const size = Number(props.fontSize)
      if (!Number.isFinite(size) || size < V5_FONT_SIZE_MIN_PT || size > V5_FONT_SIZE_MAX_PT)
        return 'font size is out of bounds'
    }
    if (props.bold !== undefined && typeof props.bold !== 'boolean') return 'bold must be boolean'
    if (
      props.fontFamily !== undefined &&
      !(V5_FONT_FAMILIES as readonly string[]).includes(String(props.fontFamily))
    )
      return 'invalid font family'
    if (
      props.fontWeight !== undefined &&
      !(V5_FONT_WEIGHTS as readonly number[]).includes(Number(props.fontWeight))
    )
      return 'invalid font weight'
    if (props.italic !== undefined && typeof props.italic !== 'boolean')
      return 'italic must be boolean'
    if (props.underline !== undefined && typeof props.underline !== 'boolean')
      return 'underline must be boolean'
    if (
      props.align !== undefined &&
      !(V5_TEXT_ALIGNS as readonly string[]).includes(String(props.align))
    )
      return 'invalid text alignment'
    if (
      props.verticalAlign !== undefined &&
      !(V5_TEXT_VERTICAL_ALIGNS as readonly string[]).includes(String(props.verticalAlign))
    )
      return 'invalid vertical text alignment'
    if (props.color !== undefined && !isColorValue(props.color)) return 'invalid text color value'
    if (
      props.sizingMode !== undefined &&
      props.sizingMode !== 'auto-width' &&
      props.sizingMode !== 'fixed-width'
    )
      return 'invalid text sizing mode'
  }
  if (node.kind === 'shape') {
    if (!(V5_SHAPE_VARIANTS as readonly string[]).includes(String(props.variant)))
      return 'invalid shape variant'
    if (props.fill !== undefined && props.fill !== 'none' && !isColorValue(props.fill))
      return 'invalid fill token'
    if (props.stroke !== undefined && props.stroke !== 'none' && !isColorValue(props.stroke))
      return 'invalid stroke token'
    if (
      props.strokeStyle !== undefined &&
      !(V5_STROKE_STYLES as readonly string[]).includes(String(props.strokeStyle))
    )
      return 'invalid stroke style'
    if (props.strokeWidth !== undefined) {
      const width = Number(props.strokeWidth)
      if (
        !Number.isFinite(width) ||
        width < V5_STROKE_WIDTH_MIN_PT ||
        width > V5_STROKE_WIDTH_MAX_PT
      )
        return 'stroke width is out of bounds'
    }
    if (
      props.cornerRadius !== undefined &&
      (!Number.isFinite(Number(props.cornerRadius)) ||
        Number(props.cornerRadius) < 0 ||
        Number(props.cornerRadius) > 200)
    )
      return 'corner radius is out of bounds'
  }
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

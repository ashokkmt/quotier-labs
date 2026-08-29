import { du, type V5Node, type V5Geometry } from './model'

/**
 * Controlled design tokens for V5 widgets. Colors exist only as named tokens shared with the Go
 * renderer; freeform hex/HTML/CSS strings are deliberately not representable.
 */
export const V5_COLOR_TOKENS = ['black', 'gray', 'white', 'primary', 'danger', 'success'] as const
export type V5ColorToken = (typeof V5_COLOR_TOKENS)[number]

/** Editor-only projection of the tokens; the Go PDF adapter keeps its own authoritative map. */
export const V5_COLOR_HEX: Record<V5ColorToken, string> = {
  black: '#111827',
  gray: '#6B7280',
  white: '#FFFFFF',
  primary: '#2563EB',
  danger: '#DC2626',
  success: '#16A34A',
}

export const V5_TEXT_ALIGNS = ['left', 'center', 'right'] as const
export type V5TextAlign = (typeof V5_TEXT_ALIGNS)[number]

export const V5_STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const
export type V5StrokeStyle = (typeof V5_STROKE_STYLES)[number]

export const V5_SHAPE_VARIANTS = ['rect', 'ellipse', 'line'] as const
export type V5ShapeVariant = (typeof V5_SHAPE_VARIANTS)[number]

export const V5_FONT_SIZE_MIN_PT = 6
export const V5_FONT_SIZE_MAX_PT = 72
export const V5_STROKE_WIDTH_MIN_PT = 0.25
export const V5_STROKE_WIDTH_MAX_PT = 12

export type V5TextProps = {
  text: string
  fontSize: number
  bold: boolean
  align: V5TextAlign
  color: V5ColorToken
}

export type V5ShapeProps = {
  variant: V5ShapeVariant
  fill: 'none' | V5ColorToken
  stroke: 'none' | V5ColorToken
  strokeStyle: V5StrokeStyle
  strokeWidth: number
}

export const clampFontSize = (value: number): number =>
  Math.min(V5_FONT_SIZE_MAX_PT, Math.max(V5_FONT_SIZE_MIN_PT, Math.round(value)))
export const clampStrokeWidth = (value: number): number =>
  Math.min(V5_STROKE_WIDTH_MAX_PT, Math.max(V5_STROKE_WIDTH_MIN_PT, Math.round(value * 4) / 4))

export const isColorToken = (value: unknown): value is V5ColorToken =>
  typeof value === 'string' && (V5_COLOR_TOKENS as readonly string[]).includes(value)

export const defaultTextProps = (overrides: Partial<V5TextProps> = {}): V5TextProps => ({
  text: 'Your text here',
  fontSize: 11,
  bold: false,
  align: 'left',
  color: 'black',
  ...overrides,
})

export const defaultShapeProps = (overrides: Partial<V5ShapeProps> = {}): V5ShapeProps => ({
  variant: 'rect',
  fill: 'primary',
  stroke: 'none',
  strokeStyle: 'solid',
  strokeWidth: 1,
  ...overrides,
})

export type V5ToolPreset = {
  id: string
  label: string
  kind: V5Node['kind']
  role: V5Node['role']
  layoutMode: V5Node['layout_mode']
  size: Pick<V5Geometry, 'width' | 'height'>
  props?: Record<string, unknown>
}

const size = (widthPt: number, heightPt: number) => ({
  width: du(widthPt * 100),
  height: du(heightPt * 100),
})

/** Palette presets, modelled on Canva's text/elements sidebar and Figma's shape tools. */
export const V5_TOOL_PRESETS: V5ToolPreset[] = [
  {
    id: 'heading',
    label: 'Heading',
    kind: 'text',
    role: 'element',
    layoutMode: 'intrinsic',
    size: size(240, 24),
    props: defaultTextProps({ text: 'Heading', fontSize: 18, bold: true }),
  },
  {
    id: 'subheading',
    label: 'Subheading',
    kind: 'text',
    role: 'element',
    layoutMode: 'intrinsic',
    size: size(200, 18),
    props: defaultTextProps({ text: 'Subheading', fontSize: 14, bold: true }),
  },
  {
    id: 'body-text',
    label: 'Body text',
    kind: 'text',
    role: 'element',
    layoutMode: 'intrinsic',
    size: size(220, 44),
    props: defaultTextProps({ text: 'Your text here', fontSize: 11 }),
  },
  {
    id: 'rect',
    label: 'Rectangle',
    kind: 'shape',
    role: 'element',
    layoutMode: 'fixed',
    size: size(120, 80),
    props: defaultShapeProps({ variant: 'rect', fill: 'primary' }),
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    kind: 'shape',
    role: 'element',
    layoutMode: 'fixed',
    size: size(100, 100),
    props: defaultShapeProps({ variant: 'ellipse', fill: 'primary' }),
  },
  {
    id: 'line',
    label: 'Line',
    kind: 'shape',
    role: 'element',
    layoutMode: 'fixed',
    size: size(200, 8),
    props: defaultShapeProps({ variant: 'line', fill: 'none', stroke: 'black', strokeWidth: 1 }),
  },
  {
    id: 'outline-box',
    label: 'Outline box',
    kind: 'shape',
    role: 'element',
    layoutMode: 'fixed',
    size: size(160, 100),
    props: defaultShapeProps({ variant: 'rect', fill: 'none', stroke: 'black', strokeWidth: 1 }),
  },
  {
    id: 'image',
    label: 'Image',
    kind: 'image',
    role: 'element',
    layoutMode: 'fixed',
    size: size(120, 120),
    props: { source: '' },
  },
  {
    id: 'table',
    label: 'Table',
    kind: 'flow-frame',
    role: 'flow-frame',
    layoutMode: 'flow-frame',
    size: size(320, 160),
    props: {},
  },
  {
    id: 'flow-frame',
    label: 'Flow frame',
    kind: 'flow-frame',
    role: 'flow-frame',
    layoutMode: 'flow-frame',
    size: size(320, 200),
    props: {},
  },
]

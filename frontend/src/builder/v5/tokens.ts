import { du, type V5Node, type V5Geometry } from './model'

/**
 * Controlled design values for V5 widgets. Colors are named tokens, transparent, or a strictly
 * validated six-digit hex value; arbitrary CSS/HTML strings are never accepted.
 */
export const V5_COLOR_TOKENS = ['black', 'gray', 'white', 'primary', 'danger', 'success'] as const
export type V5ColorToken = (typeof V5_COLOR_TOKENS)[number]
export type V5ColorValue = V5ColorToken | `#${string}` | 'transparent'

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
export const V5_TEXT_VERTICAL_ALIGNS = ['top', 'middle', 'bottom'] as const
export type V5TextVerticalAlign = (typeof V5_TEXT_VERTICAL_ALIGNS)[number]

// The inset is part of the controlled document projection and is mirrored by LayoutIR/PDF.
// Keeping it fixed avoids arbitrary CSS while ensuring glyphs never touch selection bounds.
export const V5_TEXT_PADDING_X_PT = 0
export const V5_TEXT_PADDING_Y_PT = 1
export const V5_TEXT_UNDERLINE_OFFSET_EM = 0.23
export const V5_TEXT_UNDERLINE_THICKNESS_EM = 0.055
// Auto-width frames include a small controlled end allowance for glyph overhang and browser/PDF
// raster rounding. This is frame geometry, not visible padding, so text still starts at x = 0.
export const V5_TEXT_INLINE_SAFETY_PT = 1

export const V5_STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const
export type V5StrokeStyle = (typeof V5_STROKE_STYLES)[number]

export const V5_SHAPE_VARIANTS = ['rect', 'ellipse', 'line'] as const
export type V5ShapeVariant = (typeof V5_SHAPE_VARIANTS)[number]
export const V5_FONT_FAMILIES = ['sans', 'serif', 'mono'] as const
export type V5FontFamily = (typeof V5_FONT_FAMILIES)[number]
export const V5_FONT_WEIGHTS = [300, 400, 500, 600, 700] as const
export type V5FontWeight = (typeof V5_FONT_WEIGHTS)[number]
export const V5_FONT_FAMILY_CSS: Record<V5FontFamily, string> = {
  sans: "'Quotier Sans', 'Liberation Sans', Arial, sans-serif",
  serif: "'Quotier Serif', 'Liberation Serif', 'Times New Roman', serif",
  mono: "'Quotier Mono', 'Liberation Mono', 'Courier New', monospace",
}

export const V5_FONT_SIZE_MIN_PT = 6
export const V5_FONT_SIZE_MAX_PT = 72
export const V5_STROKE_WIDTH_MIN_PT = 0.25
export const V5_STROKE_WIDTH_MAX_PT = 12

export type V5TextProps = {
  text: string
  fontSize: number
  bold: boolean
  fontFamily: V5FontFamily
  fontWeight: V5FontWeight
  italic: boolean
  underline: boolean
  align: V5TextAlign
  verticalAlign: V5TextVerticalAlign
  color: V5ColorValue
  sizingMode: 'auto-width' | 'fixed-width'
}

export type V5ShapeProps = {
  variant: V5ShapeVariant
  fill: 'none' | V5ColorValue
  stroke: 'none' | V5ColorValue
  strokeStyle: V5StrokeStyle
  strokeWidth: number
  cornerRadius: number
}

export const clampFontSize = (value: number): number =>
  Math.min(V5_FONT_SIZE_MAX_PT, Math.max(V5_FONT_SIZE_MIN_PT, Math.round(value)))
export const clampStrokeWidth = (value: number): number =>
  Math.min(V5_STROKE_WIDTH_MAX_PT, Math.max(V5_STROKE_WIDTH_MIN_PT, Math.round(value * 4) / 4))
export const intrinsicTextHeight = (fontSize: number, lines = 1): number =>
  du((Math.max(1, lines) * fontSize * 1.2 + V5_TEXT_PADDING_Y_PT * 2) * 100)
export const fitIntrinsicTextHeight = (measuredHeight: number, fontSize: number): number =>
  Math.max(intrinsicTextHeight(fontSize), du(measuredHeight))

export const isColorToken = (value: unknown): value is V5ColorToken =>
  typeof value === 'string' && (V5_COLOR_TOKENS as readonly string[]).includes(value)
export const isColorValue = (value: unknown, transparent = true): value is V5ColorValue =>
  isColorToken(value) ||
  (transparent && value === 'transparent') ||
  (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value))
export const normalizeColorValue = (value: string): V5ColorValue => {
  if (value === 'transparent' || isColorToken(value)) return value
  const candidate = value.startsWith('#') ? value : `#${value}`
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? (candidate.toUpperCase() as `#${string}`) : 'black'
}
export const colorValueToCSS = (value: unknown, fallback: V5ColorToken = 'black'): string => {
  if (value === 'transparent') return 'transparent'
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value
  return V5_COLOR_HEX[(isColorToken(value) ? value : fallback) as V5ColorToken]
}

export const defaultTextProps = (overrides: Partial<V5TextProps> = {}): V5TextProps => ({
  text: 'Your text here',
  fontSize: 11,
  bold: false,
  fontFamily: 'sans',
  fontWeight: overrides.fontWeight ?? (overrides.bold ? 700 : 400),
  italic: false,
  underline: false,
  align: 'left',
  verticalAlign: 'top',
  color: 'black',
  sizingMode: 'auto-width',
  ...overrides,
})

export const defaultShapeProps = (overrides: Partial<V5ShapeProps> = {}): V5ShapeProps => ({
  variant: 'rect',
  fill: 'primary',
  stroke: 'none',
  strokeStyle: 'solid',
  strokeWidth: 1,
  cornerRadius: 0,
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
    size: size(200, 19),
    props: defaultTextProps({ text: 'Subheading', fontSize: 14, bold: true }),
  },
  {
    id: 'body-text',
    label: 'Body text',
    kind: 'text',
    role: 'element',
    layoutMode: 'intrinsic',
    size: size(220, 16),
    props: defaultTextProps({ text: 'Text', fontSize: 11 }),
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

import { resizeKeepingTopLeft } from './geometry'
import type { V5Geometry, V5Node } from './model'
import {
  V5_FONT_FAMILY_CSS,
  V5_TEXT_INLINE_SAFETY_PT,
  V5_TEXT_PADDING_X_PT,
  V5_TEXT_PADDING_Y_PT,
  fitIntrinsicTextHeight,
  type V5TextProps,
} from './tokens'

const probes = new WeakMap<Document, HTMLTextAreaElement>()

function measurementProbe(ownerDocument: Document) {
  const existing = probes.get(ownerDocument)
  if (existing?.isConnected) return existing
  const element = ownerDocument.createElement('textarea')
  element.setAttribute('aria-hidden', 'true')
  element.tabIndex = -1
  ownerDocument.body.appendChild(element)
  probes.set(ownerDocument, element)
  return element
}

/** Measures only controlled printable text styles in an isolated, non-visible surface. The
 * result is expressed in document units and never includes editor chrome or selection bounds. */
export function measureIntrinsicTextGeometry(
  node: V5Node,
  props: V5TextProps,
  geometry: V5Geometry = node.geometry,
  ownerDocument: Document = globalThis.document,
): V5Geometry {
  if (node.kind !== 'text' || node.layout_mode !== 'intrinsic') return geometry
  const element = measurementProbe(ownerDocument)
  const sizingMode = props.sizingMode ?? 'fixed-width'
  element.value = String(props.text ?? '')
  element.wrap = sizingMode === 'auto-width' ? 'off' : 'soft'
  Object.assign(element.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    width: sizingMode === 'auto-width' ? '1px' : `${geometry.width / 100}px`,
    height: '1px',
    margin: '0',
    border: '0',
    padding: `${V5_TEXT_PADDING_Y_PT}px ${V5_TEXT_PADDING_X_PT}px`,
    overflow: 'hidden',
    resize: 'none',
    whiteSpace: 'pre-wrap',
    fontFamily: V5_FONT_FAMILY_CSS[props.fontFamily ?? 'sans'],
    fontSize: `${Number(props.fontSize ?? 11)}px`,
    fontWeight: String(Number(props.fontWeight ?? (props.bold ? 700 : 400))),
    fontStyle: props.italic ? 'italic' : 'normal',
    fontKerning: 'none',
    fontVariantLigatures: 'none',
    fontFeatureSettings: '"kern" 0, "liga" 0',
    lineHeight: '1.2',
  })
  const width =
    sizingMode === 'auto-width'
      ? Math.max(200, Math.round((element.scrollWidth + V5_TEXT_INLINE_SAFETY_PT) * 100))
      : geometry.width
  const height = fitIntrinsicTextHeight(
    Math.round(element.scrollHeight * 100),
    Number(props.fontSize ?? 11),
  )
  return resizeKeepingTopLeft(geometry, width, height)
}

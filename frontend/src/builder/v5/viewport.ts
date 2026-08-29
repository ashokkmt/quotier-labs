import { A4_HEIGHT_DU, A4_WIDTH_DU, type V5Document } from './model'
import type { Point } from './geometry'

export type Viewport = { zoom: number; pan: Point }
export function fitPage(
  document: V5Document,
  viewportWidth: number,
  viewportHeight: number,
  padding = 32,
): Viewport {
  const page = document.root.pages[0]
  const zoom = Math.min(
    (viewportWidth - padding * 2) / page.width,
    (viewportHeight - padding * 2) / page.height,
  )
  return { zoom: Math.max(0.001, zoom), pan: { x: padding, y: padding } }
}
export function fitWidth(document: V5Document, viewportWidth: number, padding = 32): Viewport {
  const page = document.root.pages[0]
  return {
    zoom: Math.max(0.001, (viewportWidth - padding * 2) / page.width),
    pan: { x: padding, y: padding },
  }
}
export function zoomAt(viewport: Viewport, nextZoom: number, anchor: Point): Viewport {
  const zoom = Math.min(8, Math.max(0.001, nextZoom))
  return {
    zoom,
    pan: {
      x: anchor.x - (anchor.x - viewport.pan.x) * (zoom / viewport.zoom),
      y: anchor.y - (anchor.y - viewport.pan.y) * (zoom / viewport.zoom),
    },
  }
}
export const panBy = (viewport: Viewport, delta: Point): Viewport => ({
  ...viewport,
  pan: { x: viewport.pan.x + delta.x, y: viewport.pan.y + delta.y },
})
export const defaultViewport = (): Viewport => ({ zoom: 0.01, pan: { x: 0, y: 0 } })
export const pageDimensions = (orientation: 'portrait' | 'landscape') =>
  orientation === 'portrait'
    ? { width: A4_WIDTH_DU, height: A4_HEIGHT_DU }
    : { width: A4_HEIGHT_DU, height: A4_WIDTH_DU }

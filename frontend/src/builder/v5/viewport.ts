import { A4_HEIGHT_DU, A4_WIDTH_DU, type V5Document } from './model'
import type { Point } from './geometry'

// Zoom is px per document unit; 100% = 0.01 px/du (1 pt = 1 CSS px). Supported range 10%–800%.
export const MIN_ZOOM = 0.001
export const MAX_ZOOM = 0.08

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
  return { zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)), pan: { x: padding, y: padding } }
}
export function fitWidth(document: V5Document, viewportWidth: number, padding = 32): Viewport {
  const page = document.root.pages[0]
  return {
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (viewportWidth - padding * 2) / page.width)),
    pan: { x: padding, y: padding },
  }
}
export function zoomAt(viewport: Viewport, nextZoom: number, anchor: Point): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
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

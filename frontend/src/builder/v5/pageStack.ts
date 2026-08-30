import type { Point } from './geometry'
import type { V5Page } from './model'

export const WORKSPACE_PADDING_PX = 48
export const WORKSPACE_TOP_PX = 64
export const PAGE_GAP_PX = 32

export type PageStackRect = {
  pageId: string
  index: number
  left: number
  top: number
  width: number
  height: number
}

export type PageStackLayout = {
  width: number
  height: number
  pages: PageStackRect[]
}

export type PageStackAnchor = { pageId: string; point: Point }

/** Screen-space page gaps stay fixed while only document dimensions scale. */
export function layoutPageStack(
  pages: Pick<V5Page, 'id' | 'width' | 'height'>[],
  zoom: number,
  viewport: { width: number; height: number },
): PageStackLayout {
  const widest = Math.max(0, ...pages.map((page) => page.width * zoom))
  const width = Math.max(viewport.width, widest + WORKSPACE_PADDING_PX * 2)
  let top = WORKSPACE_TOP_PX
  const rects = pages.map((page, index) => {
    const pageWidth = page.width * zoom
    const pageHeight = page.height * zoom
    const rect = {
      pageId: page.id,
      index,
      left: Math.max(WORKSPACE_PADDING_PX, (width - pageWidth) / 2),
      top,
      width: pageWidth,
      height: pageHeight,
    }
    top += pageHeight + (index === pages.length - 1 ? 0 : PAGE_GAP_PX)
    return rect
  })
  return {
    width,
    height: Math.max(viewport.height, top + WORKSPACE_PADDING_PX),
    pages: rects,
  }
}

/** Resolves even gap/pasteboard points to the nearest page so zoom never falls back to origin. */
export function anchorAt(
  layout: PageStackLayout,
  pages: Pick<V5Page, 'id'>[],
  zoom: number,
  contentPoint: Point,
): PageStackAnchor | null {
  let nearest: PageStackRect | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const rect of layout.pages) {
    const dx = Math.max(rect.left - contentPoint.x, 0, contentPoint.x - (rect.left + rect.width))
    const dy = Math.max(rect.top - contentPoint.y, 0, contentPoint.y - (rect.top + rect.height))
    const distance = Math.hypot(dx, dy)
    if (distance < nearestDistance) {
      nearest = rect
      nearestDistance = distance
    }
  }
  if (!nearest || !pages.some((page) => page.id === nearest!.pageId)) return null
  return {
    pageId: nearest.pageId,
    point: {
      x: (contentPoint.x - nearest.left) / zoom,
      y: (contentPoint.y - nearest.top) / zoom,
    },
  }
}

export function contentPointForAnchor(
  layout: PageStackLayout,
  anchor: PageStackAnchor,
  zoom: number,
): Point | null {
  const rect = layout.pages.find((page) => page.pageId === anchor.pageId)
  return rect ? { x: rect.left + anchor.point.x * zoom, y: rect.top + anchor.point.y * zoom } : null
}

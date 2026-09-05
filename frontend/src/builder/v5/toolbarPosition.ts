import { useLayoutEffect, useRef, useState } from 'react'
import type { Bounds } from './geometry'

export const CONTEXT_GAP_PX = 8

export function anchoredToolbarPosition(
  _selection: Bounds,
  viewport: Bounds,
  toolbar: { width: number; height: number },
  _topClearance = 0,
) {
  const left = Math.max(
    viewport.x + CONTEXT_GAP_PX,
    Math.min(
      viewport.x + viewport.width / 2 - toolbar.width / 2,
      viewport.x + viewport.width - toolbar.width - CONTEXT_GAP_PX,
    ),
  )
  return { left, top: viewport.y + 12 }
}

export function useAnchoredToolbar(bounds: Bounds, viewport?: DOMRect | null, topClearance = 0) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const viewportLeft = viewport?.left
  const viewportTop = viewport?.top
  const viewportRight = viewport?.right
  const viewportBottom = viewport?.bottom
  const selectionX = bounds.x
  const selectionY = bounds.y
  const selectionWidth = bounds.width
  const selectionHeight = bounds.height
  useLayoutEffect(() => {
    if (
      viewportLeft === undefined ||
      viewportTop === undefined ||
      viewportRight === undefined ||
      viewportBottom === undefined
    )
      return
    const update = () => {
      const width = ref.current?.offsetWidth ?? 180
      const height = ref.current?.offsetHeight ?? 40
      setPosition(
        anchoredToolbarPosition(
          {
            x: selectionX,
            y: selectionY,
            width: selectionWidth,
            height: selectionHeight,
          },
          {
            x: viewportLeft,
            y: viewportTop,
            width: viewportRight - viewportLeft,
            height: viewportBottom - viewportTop,
          },
          { width, height },
          topClearance,
        ),
      )
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    if (ref.current) observer?.observe(ref.current)
    return () => observer?.disconnect()
  }, [
    selectionX,
    selectionY,
    selectionWidth,
    selectionHeight,
    topClearance,
    viewportLeft,
    viewportTop,
    viewportRight,
    viewportBottom,
  ])
  return { ref, position }
}

export type SnapRect = {
  id: string
  x: number
  y: number
  width: number
  height: number
  visible?: boolean
}
export type SnapResult = { dx: number; dy: number; xGuide?: number; yGuide?: number }
const lines = (r: SnapRect) => ({
  x: [r.x, r.x + r.width / 2, r.x + r.width],
  y: [r.y, r.y + r.height / 2, r.y + r.height],
})
export function snapRect(
  active: SnapRect,
  candidates: SnapRect[],
  thresholdDU: number,
): SnapResult {
  let bestX: { delta: number; line: number } | null = null,
    bestY: { delta: number; line: number } | null = null
  const source = lines(active)
  for (const candidate of candidates.filter(
    (item) => item.id !== active.id && item.visible !== false,
  )) {
    const target = lines(candidate)
    for (const a of source.x)
      for (const b of target.x) {
        const delta = b - a
        if (Math.abs(delta) <= thresholdDU && (!bestX || Math.abs(delta) < Math.abs(bestX.delta)))
          bestX = { delta, line: b }
      }
    for (const a of source.y)
      for (const b of target.y) {
        const delta = b - a
        if (Math.abs(delta) <= thresholdDU && (!bestY || Math.abs(delta) < Math.abs(bestY.delta)))
          bestY = { delta, line: b }
      }
  }
  return { dx: bestX?.delta ?? 0, dy: bestY?.delta ?? 0, xGuide: bestX?.line, yGuide: bestY?.line }
}
export function distribute(axis: 'x' | 'y', rects: SnapRect[]): Record<string, number> {
  const sorted = [...rects].sort((a, b) => a[axis] - b[axis])
  if (sorted.length < 3) return {}
  const size = axis === 'x' ? 'width' : 'height'
  const first = sorted[0],
    last = sorted.at(-1)!
  const gap =
    (last[axis] - first[axis] - sorted.reduce((sum, rect) => sum + rect[size], 0)) /
    (sorted.length - 1)
  let position = first[axis] + first[size] + gap
  const result: Record<string, number> = {}
  for (const rect of sorted.slice(1, -1)) {
    result[rect.id] = position
    position += rect[size] + gap
  }
  return result
}

export type ResizeEdges = { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }

/** Snaps only the moving edges of a resize preview; returns adjusted rect and guide lines. */
export function snapResize(
  rect: SnapRect & { id: string },
  edges: ResizeEdges,
  candidates: SnapRect[],
  thresholdDU: number,
): SnapResult & { rect: SnapRect } {
  const result = snapRect(rect, candidates, thresholdDU)
  let { x, width, y, height } = rect
  if (edges.left && result.dx) {
    x += result.dx
    width -= result.dx
  } else if (edges.right && result.dx) {
    width += result.dx
  }
  if (edges.top && result.dy) {
    y += result.dy
    height -= result.dy
  } else if (edges.bottom && result.dy) {
    height += result.dy
  }
  return { ...result, rect: { ...rect, x, y, width, height } }
}

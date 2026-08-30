export type SnapRect = {
  id: string
  x: number
  y: number
  width: number
  height: number
  visible?: boolean
}
export type SnapGuide = {
  id: string
  axis: 'x' | 'y'
  position: number
  from: number
  to: number
  kind: 'edge' | 'center' | 'spacing' | 'size'
  label?: string
}
export type SnapResult = {
  dx: number
  dy: number
  xGuide?: number
  yGuide?: number
  guides: SnapGuide[]
}
const lines = (r: SnapRect) => ({
  x: [r.x, r.x + r.width / 2, r.x + r.width],
  y: [r.y, r.y + r.height / 2, r.y + r.height],
})
export function snapRect(
  active: SnapRect,
  candidates: SnapRect[],
  thresholdDU: number,
): SnapResult {
  let bestX: {
      delta: number
      line: number
      candidate: SnapRect
      sourceIndex: number
      targetIndex: number
    } | null = null,
    bestY: {
      delta: number
      line: number
      candidate: SnapRect
      sourceIndex: number
      targetIndex: number
    } | null = null
  const source = lines(active)
  for (const candidate of candidates.filter(
    (item) => item.id !== active.id && item.visible !== false,
  )) {
    const target = lines(candidate)
    for (const [sourceIndex, a] of source.x.entries())
      for (const [targetIndex, b] of target.x.entries()) {
        const delta = b - a
        if (Math.abs(delta) <= thresholdDU && (!bestX || Math.abs(delta) < Math.abs(bestX.delta)))
          bestX = { delta, line: b, candidate, sourceIndex, targetIndex }
      }
    for (const [sourceIndex, a] of source.y.entries())
      for (const [targetIndex, b] of target.y.entries()) {
        const delta = b - a
        if (Math.abs(delta) <= thresholdDU && (!bestY || Math.abs(delta) < Math.abs(bestY.delta)))
          bestY = { delta, line: b, candidate, sourceIndex, targetIndex }
      }
  }
  const visible = candidates.filter(
    (item) => item.id !== active.id && item.visible !== false && !item.id.startsWith('__'),
  )
  const spacingX = equalSpacing(active, visible, 'x', thresholdDU)
  const spacingY = equalSpacing(active, visible, 'y', thresholdDU)
  if (spacingX && (!bestX || Math.abs(spacingX.delta) < Math.abs(bestX.delta))) bestX = null
  if (spacingY && (!bestY || Math.abs(spacingY.delta) < Math.abs(bestY.delta))) bestY = null
  const dx = bestX?.delta ?? spacingX?.delta ?? 0
  const dy = bestY?.delta ?? spacingY?.delta ?? 0
  const guides: SnapGuide[] = []
  if (bestX)
    guides.push({
      id: `x:${bestX.candidate.id}:${bestX.targetIndex}`,
      axis: 'x',
      position: bestX.line,
      from: Math.min(active.y + dy, bestX.candidate.y),
      to: Math.max(active.y + active.height + dy, bestX.candidate.y + bestX.candidate.height),
      kind: bestX.sourceIndex === 1 && bestX.targetIndex === 1 ? 'center' : 'edge',
    })
  else if (spacingX) guides.push(spacingX.guide)
  if (bestY)
    guides.push({
      id: `y:${bestY.candidate.id}:${bestY.targetIndex}`,
      axis: 'y',
      position: bestY.line,
      from: Math.min(active.x + dx, bestY.candidate.x),
      to: Math.max(active.x + active.width + dx, bestY.candidate.x + bestY.candidate.width),
      kind: bestY.sourceIndex === 1 && bestY.targetIndex === 1 ? 'center' : 'edge',
    })
  else if (spacingY) guides.push(spacingY.guide)
  return {
    dx,
    dy,
    xGuide: bestX?.line ?? (spacingX ? active.x + active.width / 2 + spacingX.delta : undefined),
    yGuide: bestY?.line ?? (spacingY ? active.y + active.height / 2 + spacingY.delta : undefined),
    guides,
  }
}

function equalSpacing(
  active: SnapRect,
  candidates: SnapRect[],
  axis: 'x' | 'y',
  threshold: number,
): { delta: number; guide: SnapGuide } | null {
  const size = axis === 'x' ? 'width' : 'height'
  const cross = axis === 'x' ? 'y' : 'x'
  const crossSize = axis === 'x' ? 'height' : 'width'
  const before = candidates
    .filter((item) => item[axis] + item[size] <= active[axis] + threshold)
    .sort((a, b) => b[axis] + b[size] - (a[axis] + a[size]))[0]
  const after = candidates
    .filter((item) => item[axis] >= active[axis] + active[size] - threshold)
    .sort((a, b) => a[axis] - b[axis])[0]
  if (!before || !after) return null
  const gapBefore = active[axis] - (before[axis] + before[size])
  const gapAfter = after[axis] - (active[axis] + active[size])
  const delta = (gapAfter - gapBefore) / 2
  if (Math.abs(delta) > threshold) return null
  const gap = (gapBefore + gapAfter) / 2
  return {
    delta,
    guide: {
      id: `${axis}:spacing:${before.id}:${after.id}`,
      axis,
      position: active[axis] + active[size] / 2 + delta,
      from: Math.min(before[cross], active[cross], after[cross]),
      to: Math.max(
        before[cross] + before[crossSize],
        active[cross] + active[crossSize],
        after[cross] + after[crossSize],
      ),
      kind: 'spacing',
      label: `${Math.round(gap) / 100} pt`,
    },
  }
}
export function distribute(axis: 'x' | 'y', rects: SnapRect[]): Record<string, number> {
  const sorted = [...rects].sort((a, b) => a[axis] - b[axis])
  if (sorted.length < 3) return {}
  const size = axis === 'x' ? 'width' : 'height'
  const first = sorted[0],
    last = sorted.at(-1)!
  const gap =
    (last[axis] + last[size] - first[axis] - sorted.reduce((sum, rect) => sum + rect[size], 0)) /
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
  let bestX: { delta: number; line: number; candidate: SnapRect } | null = null
  let bestY: { delta: number; line: number; candidate: SnapRect } | null = null
  const movingX = edges.left ? rect.x : edges.right ? rect.x + rect.width : null
  const movingY = edges.top ? rect.y : edges.bottom ? rect.y + rect.height : null
  for (const candidate of candidates.filter(
    (item) => item.id !== rect.id && item.visible !== false,
  )) {
    if (movingX !== null)
      for (const line of lines(candidate).x) {
        const delta = line - movingX
        if (Math.abs(delta) <= thresholdDU && (!bestX || Math.abs(delta) < Math.abs(bestX.delta)))
          bestX = { delta, line, candidate }
      }
    if (movingY !== null)
      for (const line of lines(candidate).y) {
        const delta = line - movingY
        if (Math.abs(delta) <= thresholdDU && (!bestY || Math.abs(delta) < Math.abs(bestY.delta)))
          bestY = { delta, line, candidate }
      }
  }
  const result: SnapResult = {
    dx: bestX?.delta ?? 0,
    dy: bestY?.delta ?? 0,
    xGuide: bestX?.line,
    yGuide: bestY?.line,
    guides: [
      ...(bestX
        ? [
            {
              id: `x:resize:${bestX.candidate.id}`,
              axis: 'x' as const,
              position: bestX.line,
              from: Math.min(rect.y, bestX.candidate.y),
              to: Math.max(rect.y + rect.height, bestX.candidate.y + bestX.candidate.height),
              kind: 'edge' as const,
            },
          ]
        : []),
      ...(bestY
        ? [
            {
              id: `y:resize:${bestY.candidate.id}`,
              axis: 'y' as const,
              position: bestY.line,
              from: Math.min(rect.x, bestY.candidate.x),
              to: Math.max(rect.x + rect.width, bestY.candidate.x + bestY.candidate.width),
              kind: 'edge' as const,
            },
          ]
        : []),
    ],
  }
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
  const guides = [...result.guides]
  if ((edges.left || edges.right) && result.xGuide === undefined) {
    const match = nearestSize(rect.width, candidates, 'width', thresholdDU)
    if (match) {
      const delta = match.value - rect.width
      if (edges.left) {
        x -= delta
        width += delta
      } else width += delta
      guides.push({
        id: `x:size:${match.candidate.id}`,
        axis: 'x',
        position: x + width / 2,
        from: y,
        to: y + height,
        kind: 'size',
        label: `${Math.round(width) / 100} pt`,
      })
    }
  }
  if ((edges.top || edges.bottom) && result.yGuide === undefined) {
    const match = nearestSize(rect.height, candidates, 'height', thresholdDU)
    if (match) {
      const delta = match.value - rect.height
      if (edges.top) {
        y -= delta
        height += delta
      } else height += delta
      guides.push({
        id: `y:size:${match.candidate.id}`,
        axis: 'y',
        position: y + height / 2,
        from: x,
        to: x + width,
        kind: 'size',
        label: `${Math.round(height) / 100} pt`,
      })
    }
  }
  return { ...result, guides, rect: { ...rect, x, y, width, height } }
}

function nearestSize(
  current: number,
  candidates: SnapRect[],
  dimension: 'width' | 'height',
  threshold: number,
): { value: number; candidate: SnapRect } | null {
  let best: { value: number; candidate: SnapRect } | null = null
  for (const candidate of candidates) {
    if (candidate.visible === false || candidate.id.startsWith('__')) continue
    const delta = Math.abs(candidate[dimension] - current)
    if (delta <= threshold && (!best || delta < Math.abs(best.value - current)))
      best = { value: candidate[dimension], candidate }
  }
  return best
}

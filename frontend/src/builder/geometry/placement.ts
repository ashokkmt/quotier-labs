import type { BuilderNode } from '../document/model'
export type PlacementIntent = {
  intent:
    'before' | 'after' | 'inside' | 'wrap-left' | 'wrap-right' | 'escape-before' | 'escape-after'
  parentId: string
  index: number
  targetId?: string
}
export type RectLike = { left: number; top: number; width: number; height: number }

export function predictPlacement(
  parent: BuilderNode,
  children: BuilderNode[],
  rects: Record<string, RectLike>,
  pointer: { x: number; y: number },
): PlacementIntent {
  if (!children.length) return { intent: 'inside', parentId: parent.id, index: 0 }

  const isHorizontal = parent.props.direction === 'horizontal'

  for (let index = 0; index < children.length; index++) {
    const target = children[index]
    const rect = rects[target.id]
    if (!rect) continue

    // Check if pointer is vertically within this child's rect (with some padding)
    if (pointer.y >= rect.top && pointer.y <= rect.top + rect.height) {
      // If we are in a vertical layout, check for 50/50 wrap (left/right 15% bands)
      if (
        !isHorizontal &&
        target.style.width !== 'half' &&
        target.style.width !== 'third' &&
        target.style.width !== 'two-thirds'
      ) {
        const band = rect.width * 0.15
        if (pointer.x >= rect.left && pointer.x <= rect.left + band) {
          return { intent: 'wrap-left', parentId: parent.id, index, targetId: target.id }
        }
        if (pointer.x >= rect.left + rect.width - band && pointer.x <= rect.left + rect.width) {
          return { intent: 'wrap-right', parentId: parent.id, index, targetId: target.id }
        }
      }

      // Normal before/after prediction based on axis
      const axis = isHorizontal ? pointer.x : pointer.y
      const midpoint =
        (isHorizontal ? rect.left : rect.top) + (isHorizontal ? rect.width : rect.height) / 2

      if (axis < midpoint) {
        return { intent: 'before', parentId: parent.id, index, targetId: target.id }
      }
    }
  }

  return {
    intent: 'after',
    parentId: parent.id,
    index: children.length,
    targetId: children[children.length - 1].id,
  }
}

export function alignmentGuides(active: RectLike, siblings: RectLike[], threshold = 6) {
  const guides: Array<{ axis: 'x' | 'y'; position: number }> = []
  for (const sibling of siblings) {
    for (const [a, b] of [
      [active.left, sibling.left],
      [active.left + active.width, sibling.left + sibling.width],
      [active.left + active.width / 2, sibling.left + sibling.width / 2],
    ] as Array<[number, number]>)
      if (Math.abs(a - b) <= threshold) guides.push({ axis: 'x', position: b })
    for (const [a, b] of [
      [active.top, sibling.top],
      [active.top + active.height, sibling.top + sibling.height],
      [active.top + active.height / 2, sibling.top + sibling.height / 2],
    ] as Array<[number, number]>)
      if (Math.abs(a - b) <= threshold) guides.push({ axis: 'y', position: b })
  }
  return guides
}

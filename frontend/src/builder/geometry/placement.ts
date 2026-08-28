import type { DocumentModel } from '../document/model'
import { isContainer } from '../document/model'
import { getWidget } from '../registry/registry'
import type { DragSource } from '../document/store'

export type RectLike = { left: number; top: number; width: number; height: number }
export type OperationPlan = {
  operation: 'insert' | 'move' | 'wrap-beside'
  parentId: string
  index: number
  targetId?: string
  side?: 'left' | 'right'
  axis?: 'horizontal' | 'vertical'
  linePosition?: 'before' | 'after'
  preview: 'line' | 'inside' | 'split'
  explanation: string
}

const contains = (rect: RectLike, x: number, y: number) =>
  x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
const band = (size: number) => Math.max(24, Math.min(72, size * 0.18))

export function resolvePlacement(
  document: DocumentModel,
  source: DragSource,
  rects: Record<string, RectLike>,
  pointer: { x: number; y: number },
): OperationPlan | null {
  const sourceType = source.type === 'create' ? source.widget : document.nodes[source.nodeId]?.type
  const sourceDef = sourceType ? getWidget(sourceType) : undefined
  if (!sourceDef) return null
  const candidates = Object.values(document.nodes)
    .filter(isContainer)
    .filter((node) => rects[node.id] && contains(rects[node.id], pointer.x, pointer.y))
    .sort((a, b) => rects[a.id].width * rects[a.id].height - rects[b.id].width * rects[b.id].height)
  for (const parent of candidates) {
    if (!(
      sourceDef.capabilities.allowedParents === '*' ||
      sourceDef.capabilities.allowedParents.includes(parent.role)
    ))
      continue
    const children = parent.children.map((id) => document.nodes[id]).filter(Boolean)
    if (!children.length)
      return {
        operation: source.type === 'move' ? 'move' : 'insert',
        parentId: parent.id,
        index: 0,
        preview: 'inside',
        axis: parent.layout.direction ?? 'vertical',
        explanation: 'Place in empty container',
      }
    const horizontal = parent.layout.direction === 'horizontal'
    const axis = horizontal ? 'horizontal' : 'vertical'
    const placed = children
      .map((child) => ({ child, rect: rects[child.id] }))
      .filter((candidate): candidate is { child: (typeof children)[number]; rect: RectLike } =>
        Boolean(candidate.rect),
      )
      .sort((a, b) => (horizontal ? a.rect.left - b.rect.left : a.rect.top - b.rect.top))
    for (let index = 0; index < placed.length; index++) {
      const { child, rect } = placed[index]
      const inChild = contains(rect, pointer.x, pointer.y)
      if (
        !horizontal &&
        sourceDef.capabilities.horizontal &&
        inChild &&
        (pointer.x - rect.left < band(rect.width) ||
          rect.left + rect.width - pointer.x < band(rect.width))
      ) {
        return {
          operation: 'wrap-beside',
          parentId: parent.id,
          index,
          targetId: child.id,
          side: pointer.x - rect.left < band(rect.width) ? 'left' : 'right',
          preview: 'split',
          axis,
          explanation: 'Place side by side',
        }
      }
      const coordinate = horizontal ? pointer.x : pointer.y
      const middle = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2
      if (coordinate < middle)
        return {
          operation: source.type === 'move' ? 'move' : 'insert',
          parentId: parent.id,
          index,
          targetId: child.id,
          preview: 'line',
          axis,
          linePosition: 'before',
          explanation: 'Insert before',
        }
    }
    const last = placed[placed.length - 1]?.child
    return {
      operation: source.type === 'move' ? 'move' : 'insert',
      parentId: parent.id,
      index: placed.length,
      targetId: last?.id,
      preview: 'line',
      axis,
      linePosition: 'after',
      explanation: 'Insert at end',
    }
  }
  const root = document.nodes[document.rootId]
  return sourceDef.capabilities.allowedParents === '*' ||
    sourceDef.capabilities.allowedParents.includes(root.role)
    ? {
        operation: source.type === 'move' ? 'move' : 'insert',
        parentId: root.id,
        index: root.children.length,
        preview: 'inside',
        axis: 'vertical',
        explanation: 'Place in document body',
      }
    : null
}

export function alignmentGuides(active: RectLike, siblings: RectLike[], threshold = 6) {
  const guides: Array<{ axis: 'x' | 'y'; position: number }> = []
  for (const sibling of siblings)
    for (const [axis, own, theirs] of [
      ['x', active.left, sibling.left],
      ['x', active.left + active.width, sibling.left + sibling.width],
      ['x', active.left + active.width / 2, sibling.left + sibling.width / 2],
      ['y', active.top, sibling.top],
      ['y', active.top + active.height, sibling.top + sibling.height],
      ['y', active.top + active.height / 2, sibling.top + sibling.height / 2],
    ] as Array<['x' | 'y', number, number]>)
      if (Math.abs(own - theirs) <= threshold) guides.push({ axis, position: theirs })
  return guides
}

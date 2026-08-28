import type { Block } from './block'

export type DropSide = 'inside' | 'before' | 'after' | 'left' | 'right'
export type DropResolution = { targetId: string; side: DropSide }

export function findParent(
  nodes: Block[],
  childId: string,
  parent: Block | null = null,
): Block | null {
  for (const node of nodes) {
    if (node.id === childId) return parent
    const found = findParent(node.children, childId, node)
    if (found) return found
  }
  return null
}

function findIndex(nodes: Block[], id: string) {
  return nodes.findIndex((node) => node.id === id)
}
function isDescendant(source: Block, id: string): boolean {
  return source.id === id || source.children.some((child) => isDescendant(child, id))
}
function replace(nodes: Block[], id: string, replacement: Block): Block[] {
  return nodes.map((node) =>
    node.id === id ? replacement : { ...node, children: replace(node.children, id, replacement) },
  )
}
function insert(nodes: Block[], index: number, value: Block) {
  const result = [...nodes]
  result.splice(Math.max(0, Math.min(index, result.length)), 0, value)
  return result
}
function withSibling(
  nodes: Block[],
  targetId: string,
  value: Block,
  before: boolean,
): Block[] | null {
  const parent = findParent(nodes, targetId)
  const siblings = parent ? parent.children : nodes
  const index = findIndex(siblings, targetId)
  if (index < 0) return null
  const next = insert(
    siblings.filter((node) => node.id !== value.id),
    before ? index : index + 1,
    value,
  )
  return parent ? replace(nodes, parent.id, { ...parent, children: next }) : next
}

function horizontalWrapper(target: Block, addition: Block): Block {
  return {
    id: crypto.randomUUID(),
    kind: 'section',
    widget_type: 'container',
    children: [target, addition],
    visible: true,
    optional: false,
    layout: { direction: 'horizontal', gap: 12, padding: 0 },
  }
}

export function placeBlock(
  nodes: Block[],
  block: Block,
  resolution?: DropResolution,
): Block[] | null {
  if (!resolution) return [...nodes, block]
  const target = locate(nodes, resolution.targetId)
  if (!target || isDescendant(block, target.id)) return null
  if (resolution.side === 'inside')
    return target.widget_type === 'container'
      ? replace(nodes, target.id, { ...target, children: [...target.children, block] })
      : null
  if (resolution.side === 'left' || resolution.side === 'right') {
    const parent = findParent(nodes, target.id)
    if (parent?.widget_type === 'container' && parent.layout?.direction === 'horizontal') {
      const siblings = parent.children.filter((node) => node.id !== block.id)
      const index = findIndex(siblings, target.id)
      const next = insert(siblings, resolution.side === 'left' ? index : index + 1, block)
      return replace(nodes, parent.id, { ...parent, children: next })
    }
    return replace(nodes, target.id, horizontalWrapper(target, block))
  }
  return withSibling(nodes, target.id, block, resolution.side === 'before')
}

export function locate(nodes: Block[], id: string): Block | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = locate(node.children, id)
    if (found) return found
  }
  return null
}

export function resolveDrop(
  event: { clientX: number; clientY: number },
  element: HTMLElement,
  target: Block,
): DropResolution {
  const bounds = element.getBoundingClientRect()
  const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1)
  const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1)
  if (target.widget_type === 'container' && x > 0.2 && x < 0.8 && y > 0.2 && y < 0.8)
    return { targetId: target.id, side: 'inside' }
  if (x < 0.25) return { targetId: target.id, side: 'left' }
  if (x > 0.75) return { targetId: target.id, side: 'right' }
  return { targetId: target.id, side: y < 0.5 ? 'before' : 'after' }
}

import type { V5Document, V5Node, V5Story } from './model'
import { apply, geometryMatrix, identity, multiply, type Matrix, type Point } from './geometry'

/** Structural selectors shared by commands, canvas, and panels. Pure, no React. */

export function flattenNodes(nodes: V5Node[]): V5Node[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])])
}

export function findNode(nodes: V5Node[], id: string): V5Node | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children ?? [], id)
    if (found) return found
  }
  return null
}

/** Ancestor chain from page children down to the node, empty when unknown. */
export function ancestorChain(document: V5Document, id: string): V5Node[] {
  const visit = (nodes: V5Node[], trail: V5Node[]): V5Node[] | null => {
    for (const node of nodes) {
      if (node.id === id) return [...trail, node]
      const found = visit(node.children ?? [], [...trail, node])
      if (found) return found
    }
    return null
  }
  for (const page of document.root.pages) {
    const found = visit(page.children, [])
    if (found) return found
  }
  return []
}

/** Transform from a node's local coordinates into authored-page coordinates. */
export function worldMatrixOf(document: V5Document, id: string): Matrix {
  return ancestorChain(document, id).reduce(
    (matrix, node) => multiply(matrix, geometryMatrix(node.geometry)),
    identity,
  )
}

/** Transform from the node's parent coordinates into authored-page coordinates. */
export function parentWorldMatrixOf(document: V5Document, id: string): Matrix {
  const chain = ancestorChain(document, id)
  return chain
    .slice(0, -1)
    .reduce((matrix, node) => multiply(matrix, geometryMatrix(node.geometry)), identity)
}

/** Converts a page-space pointer delta into the selected node's parent coordinate space. */
export function pageDeltaToParent(document: V5Document, id: string, delta: Point): Point {
  const matrix = parentWorldMatrixOf(document, id)
  // Transform as a vector by subtracting the transformed origin, so translation cancels.
  const origin = apply(matrix, { x: 0, y: 0 })
  const endpoint = apply(matrix, { x: 1, y: 0 })
  const angle = Math.atan2(endpoint.y - origin.y, endpoint.x - origin.x)
  const cosine = Math.cos(-angle)
  const sine = Math.sin(-angle)
  return {
    x: delta.x * cosine - delta.y * sine,
    y: delta.x * sine + delta.y * cosine,
  }
}

/** Effective lock includes every ancestor (tools.md §18). */
export function isEffectivelyLocked(document: V5Document, id: string): boolean {
  return ancestorChain(document, id).some((node) => node.locked)
}

/** Effective visibility: an explicit hidden flag anywhere in the chain hides the node. */
export function isEffectivelyHidden(document: V5Document, id: string): boolean {
  return ancestorChain(document, id).some((node) => node.visibility === 'hidden')
}

export function pageOf(document: V5Document, id: string) {
  return document.root.pages.find((page) => findNode(page.children, id) !== null) ?? null
}

/** Direct children of the container owning id; page children when id is a page id. */
export function siblingsOf(document: V5Document, id: string): V5Node[] {
  for (const page of document.root.pages) {
    if (page.id === id) return page.children
    const visit = (nodes: V5Node[]): V5Node[] | null => {
      for (const node of nodes) {
        if (node.id === id) return node.children ?? []
        const found = visit(node.children ?? [])
        if (found) return found
      }
      return null
    }
    const found = visit(page.children)
    if (found) return found
  }
  return []
}

/** Remap every node/story ID in a payload; returns fresh nodes + stories with references fixed. */
export function remapPayload(
  nodes: V5Node[],
  stories: V5Story[],
  nextID: (prefix: string) => string,
): { nodes: V5Node[]; stories: V5Story[] } {
  const nodeMap = new Map<string, string>()
  const storyMap = new Map<string, string>()
  for (const node of nodes) nodeMap.set(node.id, nextID('node'))
  for (const story of stories) storyMap.set(story.id, nextID('story'))
  const cloneNode = (node: V5Node): V5Node => ({
    ...node,
    id: nodeMap.get(node.id)!,
    geometry: { ...node.geometry },
    props: node.props ? { ...node.props } : undefined,
    story_id: node.story_id ? storyMap.get(node.story_id) : undefined,
    child_ids: undefined,
    children: node.children?.map(cloneNode),
  })
  const cloned = nodes.map(cloneNode)
  const sync = (node: V5Node) => {
    if (node.children) node.child_ids = node.children.map((child) => child.id)
    node.children?.forEach(sync)
  }
  cloned.forEach(sync)
  return {
    nodes: cloned,
    stories: stories.map((story) => ({ ...story, id: storyMap.get(story.id)! })),
  }
}

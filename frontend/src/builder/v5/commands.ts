import {
  bounds,
  corners,
  geometryPositionFromMatrix,
  geometryMatrix,
  identity,
  invert,
  multiply,
  quantizeGeometry,
} from './geometry'
import {
  du,
  A4_HEIGHT_DU,
  A4_WIDTH_DU,
  MAX_V5_DEPTH,
  type V5Document,
  type V5Geometry,
  type V5Node,
  type V5Story,
} from './model'
import { ancestorChain, findNode, remapPayload } from './selectors'
import { parseV5, serializeV5 } from './serialization'
import type { V5Command } from './history'
import { cloneNode, findPlacement } from './placement'
import { getV5Widget } from './registry'
import { distribute } from './snapping'
import { normalizeTableData, tableHeightDU, type V5TableData } from './table'
import { V5_TEXT_PADDING_Y_PT } from './tokens'

type NodeLocation = { node: V5Node; siblings: V5Node[]; parent: V5Node | null; pageId: string }
const clone = (document: V5Document) => parseV5(serializeV5(document))
function locate(document: V5Document, id: string): NodeLocation | null {
  const visit = (nodes: V5Node[], parent: V5Node | null, pageId: string): NodeLocation | null => {
    for (const node of nodes) {
      if (node.id === id) return { node, siblings: nodes, parent, pageId }
      const found = visit(node.children ?? [], node, pageId)
      if (found) return found
    }
    return null
  }
  for (const page of document.root.pages) {
    const found = visit(page.children, null, page.id)
    if (found) return found
  }
  return null
}
function snapshotCommand(
  label: string,
  applyChange: (document: V5Document) => V5Document,
  coalesceKey?: string,
): V5Command {
  let before: V5Document | null = null
  return {
    label,
    coalesceKey,
    apply: (document) => {
      before = clone(document)
      return applyChange(clone(document))
    },
    revert: () =>
      before
        ? clone(before)
        : (() => {
            throw new Error('missing command inverse')
          })(),
  }
}
function syncChildIDs(node: V5Node | null) {
  if (node) node.child_ids = (node.children ?? []).map((child) => child.id)
}

/** Keeps child_ids in sync whether the mutated container is a page or a group. */
function syncContainerIDs(document: V5Document, found: NodeLocation) {
  if (found.parent) {
    syncChildIDs(found.parent)
    return
  }
  const page = document.root.pages.find((candidate) => candidate.children === found.siblings)
  if (page) page.child_ids = page.children.map((child) => child.id)
}
/** A node is effectively locked when it or any ancestor is locked (tools.md §18). */
function isLockedThroughAncestors(document: V5Document, id: string): boolean {
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
    if (found?.some((node) => node.locked)) return true
  }
  return false
}
function flatten(nodes: V5Node[]): V5Node[] {
  return nodes.flatMap((node) => [node, ...(node.children ?? [])])
}
function updateNode(document: V5Document, id: string, update: (node: V5Node) => void) {
  const found = locate(document, id)
  if (!found) throw new Error(`unknown node ${id}`)
  if (isLockedThroughAncestors(document, id)) throw new Error(`node ${id} is locked`)
  update(found.node)
  return document
}
function descendants(node: V5Node): string[] {
  return [node.id, ...(node.children ?? []).flatMap(descendants)]
}

function pruneUnreferencedStories(document: V5Document) {
  const referenced = new Set(
    document.root.pages.flatMap((page) =>
      flatten(page.children).flatMap((node) => (node.story_id ? [node.story_id] : [])),
    ),
  )
  document.stories = (document.stories ?? []).filter((story) => referenced.has(story.id))
}

/** Complete node transform in page coordinates. Groups currently carry translation/rotation
 * only, so decomposition remains deterministic and does not introduce scale/skew drift. */
function worldMatrix(document: V5Document, id: string) {
  return ancestorChain(document, id).reduce(
    (matrix, node) => multiply(matrix, geometryMatrix(node.geometry)),
    identity,
  )
}

function worldRotation(document: V5Document, id: string): number {
  return ancestorChain(document, id).reduce((sum, node) => sum + node.geometry.rotation, 0)
}
function isDescendant(document: V5Document, possibleDescendant: string, ancestor: string): boolean {
  const found = locate(document, ancestor)
  return !!found && descendants(found.node).includes(possibleDescendant)
}

export const updateNodeGeometry = (id: string, geometry: V5Geometry) =>
  snapshotCommand(
    'Update geometry',
    (d) =>
      updateNode(d, id, (node) => {
        node.geometry = quantizeGeometry(geometry)
      }),
    `geometry:${id}`,
  )

/** Commits an in-place text edit and its content-derived frame as one undoable change. */
export const updateTextContentAndGeometry = (id: string, text: string, geometry: V5Geometry) =>
  snapshotCommand(
    'Edit text',
    (d) =>
      updateNode(d, id, (node) => {
        if (node.kind !== 'text') throw new Error('node is not text')
        node.props = { ...node.props, text }
        node.geometry = quantizeGeometry(geometry)
      }),
    `text-edit:${id}`,
  )

/** Keeps a direct resize and its persistent sizing policy in the same history transaction. */
export const updateNodeGeometryAndProps = (
  id: string,
  geometry: V5Geometry,
  props: Record<string, unknown>,
) =>
  snapshotCommand(
    'Resize object',
    (d) =>
      updateNode(d, id, (node) => {
        node.geometry = quantizeGeometry(geometry)
        node.props = { ...node.props, ...props }
      }),
    `geometry:${id}`,
  )
export const moveNodes = (ids: string[], dx: number, dy: number) =>
  snapshotCommand('Move selection', (d) => {
    // Atomic selection move: one locked member rejects the whole gesture (tools.md §9).
    for (const id of ids)
      if (isLockedThroughAncestors(d, id))
        throw new Error('selection contains locked objects and cannot move')
    for (const id of ids) {
      const found = locate(d, id)!
      found.node.geometry = quantizeGeometry({
        ...found.node.geometry,
        x: found.node.geometry.x + dx,
        y: found.node.geometry.y + dy,
      })
    }
    return d
  })
export const setNodeVisibility = (id: string, visibility: V5Node['visibility']) =>
  snapshotCommand('Set visibility', (d) => {
    const found = locate(d, id)
    if (!found) throw new Error(`unknown node ${id}`)
    found.node.visibility = visibility
    return d
  })
export const setNodeLocked = (id: string, locked: boolean) =>
  snapshotCommand('Set lock', (d) => {
    const found = locate(d, id)
    if (!found) throw new Error(`unknown node ${id}`)
    found.node.locked = locked
    return d
  })
export const setNodesLocked = (ids: string[], locked: boolean) =>
  snapshotCommand(locked ? 'Lock selection' : 'Unlock selection', (d) => {
    const locations = ids.map((id) => locate(d, id))
    if (locations.some((location) => !location))
      throw new Error('selection contains a missing object')
    for (const location of locations) location!.node.locked = locked
    return d
  })

export const setNodesVisibility = (ids: string[], visibility: V5Node['visibility']) =>
  snapshotCommand(visibility === 'shown' ? 'Show selection' : 'Hide selection', (d) => {
    for (const id of ids) {
      const found = locate(d, id)
      if (!found) throw new Error('selection contains a missing object')
    }
    for (const id of ids) locate(d, id)!.node.visibility = visibility
    return d
  })
export const renameNode = (id: string, name: string) =>
  snapshotCommand(
    'Rename layer',
    (d) =>
      updateNode(d, id, (node) => {
        node.name = name.trim() || node.kind
      }),
    `rename:${id}`,
  )
export const updateNodeProps = (id: string, props: Record<string, unknown>) =>
  snapshotCommand(
    'Update properties',
    (d) =>
      updateNode(d, id, (node) => {
        node.props = { ...node.props, ...props }
        if (node.kind === 'text') {
          const fontSize = Number(node.props.fontSize ?? 11)
          // A selection frame must enclose at least one painted line plus the equal document
          // inset. Multi-line intrinsic content is expanded from measured editor height.
          const minimumHeight = du((fontSize * 1.2 + V5_TEXT_PADDING_Y_PT * 2) * 100)
          if (node.geometry.height < minimumHeight) node.geometry.height = minimumHeight
        }
      }),
    `props:${id}`,
  )

export const updateStoryContent = (storyId: string, content: unknown) =>
  snapshotCommand(
    'Update story content',
    (d) => {
      const story = d.stories?.find((candidate) => candidate.id === storyId)
      if (!story) throw new Error('unknown story')
      story.content = JSON.parse(JSON.stringify(content))
      return d
    },
    `story:${storyId}`,
  )

/** Table structure and its derived frame height are one history/persistence transaction. */
export const updateTableContent = (
  nodeId: string,
  content: V5TableData,
  geometry?: Partial<V5Geometry>,
) =>
  snapshotCommand(
    'Update table',
    (d) => {
      const found = locate(d, nodeId)
      if (!found || found.node.role !== 'flow-frame' || !found.node.story_id)
        throw new Error('unknown table')
      if (isLockedThroughAncestors(d, nodeId)) throw new Error('table is locked')
      const story = d.stories?.find((candidate) => candidate.id === found.node.story_id)
      if (!story || story.kind !== 'table') throw new Error('table story is missing')
      const normalized = normalizeTableData(content)
      story.content = JSON.parse(JSON.stringify(normalized))
      const page = d.root.pages.find((candidate) => candidate.id === found.pageId)
      const nextY = geometry?.y ?? found.node.geometry.y
      const desiredHeight = tableHeightDU(normalized)
      const availableHeight = Math.max(200, (page?.height ?? desiredHeight) - nextY)
      const desiredWidth = normalized.column_widths.reduce((sum, width) => sum + width, 0)
      const availableWidth = Math.max(
        200,
        (page?.width ?? desiredWidth) - (geometry?.x ?? found.node.geometry.x),
      )
      found.node.geometry = quantizeGeometry({
        ...found.node.geometry,
        ...geometry,
        // Structure edits follow the sum of authored columns. An explicit outer resize remains
        // authoritative, but deleting a column must shrink the frame and selection chrome.
        width: Math.min(availableWidth, Math.max(geometry?.width ?? desiredWidth, 200)),
        height: Math.min(desiredHeight, availableHeight),
      })
      return d
    },
    `table:${nodeId}`,
  )

export const insertNode = (pageId: string, node: V5Node, index?: number) =>
  snapshotCommand('Insert node', (d) => {
    const page = d.root.pages.find((candidate) => candidate.id === pageId)
    if (!page) throw new Error(`unknown page ${pageId}`)
    const at = Math.max(0, Math.min(index ?? page.children.length, page.children.length))
    page.children.splice(at, 0, node)
    page.child_ids = page.children.map((child) => child.id)
    return d
  })

/** Inserts a flow frame together with the story it displays; stories exist only with a frame. */
export const insertStoryFrame = (pageId: string, node: V5Node, story: V5Story) =>
  snapshotCommand('Insert flow frame', (d) => {
    const page = d.root.pages.find((candidate) => candidate.id === pageId)
    if (!page) throw new Error(`unknown page ${pageId}`)
    if (node.role !== 'flow-frame' || node.story_id !== story.id)
      throw new Error('frame must reference the inserted story')
    if (d.stories?.some((existing) => existing.id === story.id))
      throw new Error(`duplicate story ${story.id}`)
    d.stories = [...(d.stories ?? []), story]
    page.children.push(node)
    page.child_ids = page.children.map((child) => child.id)
    return d
  })
export const deleteNode = (id: string) =>
  snapshotCommand('Delete node', (d) => {
    const found = locate(d, id)
    if (!found) throw new Error(`unknown node ${id}`)
    if (isLockedThroughAncestors(d, id)) throw new Error(`node ${id} is locked`)
    found.siblings.splice(found.siblings.indexOf(found.node), 1)
    syncContainerIDs(d, found)
    pruneUnreferencedStories(d)
    return d
  })
export const reorderNode = (id: string, targetIndex: number) =>
  snapshotCommand('Reorder layer', (d) => {
    const found = locate(d, id)
    if (!found) throw new Error(`unknown node ${id}`)
    const from = found.siblings.indexOf(found.node)
    const [node] = found.siblings.splice(from, 1)
    found.siblings.splice(Math.max(0, Math.min(targetIndex, found.siblings.length)), 0, node)
    syncContainerIDs(d, found)
    return d
  })
export const reparentNode = (id: string, targetGroupId: string | null, index?: number) =>
  snapshotCommand('Reparent node', (d) => {
    if (targetGroupId && (id === targetGroupId || isDescendant(d, targetGroupId, id)))
      throw new Error('cannot reparent into own descendant')
    const source = locate(d, id)
    const target = targetGroupId ? locate(d, targetGroupId) : null
    if (!source || (targetGroupId && (!target || target.node.role !== 'group')))
      throw new Error('invalid reparent target')
    if (source.node.role !== 'group' && getV5Widget(source.node.kind)?.canGroup === false)
      throw new Error('this object cannot be placed in a group')
    if (
      isLockedThroughAncestors(d, id) ||
      (targetGroupId && isLockedThroughAncestors(d, targetGroupId)) ||
      (target && source.pageId !== target.pageId)
    )
      throw new Error('reparent target is unavailable')
    const subtreeDepth = (node: V5Node): number =>
      1 + Math.max(0, ...(node.children ?? []).map(subtreeDepth))
    const targetDepth = targetGroupId ? ancestorChain(d, targetGroupId).length : 0
    if (targetDepth + subtreeDepth(source.node) > MAX_V5_DEPTH + 1)
      throw new Error('maximum group depth exceeded')
    const sourceWorld = worldMatrix(d, id)
    const sourceRotation = worldRotation(d, id)
    const targetMatrix = targetGroupId ? worldMatrix(d, targetGroupId) : identity
    const targetRotation = targetGroupId ? worldRotation(d, targetGroupId) : 0
    source.siblings.splice(source.siblings.indexOf(source.node), 1)
    syncContainerIDs(d, source)
    const localMatrix = multiply(invert(targetMatrix), sourceWorld)
    const local = geometryPositionFromMatrix(
      localMatrix,
      source.node.geometry.width,
      source.node.geometry.height,
      sourceRotation - targetRotation,
    )
    source.node.geometry = quantizeGeometry({
      ...source.node.geometry,
      x: local.x,
      y: local.y,
      rotation: sourceRotation - targetRotation,
    })
    const targetChildren = target
      ? (target.node.children ?? (target.node.children = []))
      : d.root.pages.find((page) => page.id === source.pageId)!.children
    const at = Math.max(0, Math.min(index ?? targetChildren.length, targetChildren.length))
    targetChildren.splice(at, 0, source.node)
    if (target) syncChildIDs(target.node)
    else {
      const page = d.root.pages.find((candidate) => candidate.id === source.pageId)!
      page.child_ids = page.children.map((child) => child.id)
    }
    return d
  })

export const groupNodes = (pageId: string, nodeIds: string[], groupId: string) =>
  snapshotCommand('Group selection', (d) => {
    const page = d.root.pages.find((candidate) => candidate.id === pageId)
    if (!page || nodeIds.length < 2) throw new Error('group requires two siblings')
    const locations = nodeIds.map((id) => locate(d, id))
    const first = locations[0]
    if (
      !first ||
      locations.some(
        (location) =>
          !location || location.pageId !== pageId || location.siblings !== first.siblings,
      )
    )
      throw new Error('group requires siblings in one container')
    const selected = first.siblings.filter((node) => nodeIds.includes(node.id))
    if (
      selected.length !== nodeIds.length ||
      selected.some(
        (node) =>
          isLockedThroughAncestors(d, node.id) ||
          (node.role !== 'group' && getV5Widget(node.kind)?.canGroup === false),
      )
    )
      throw new Error('selection contains objects that cannot be grouped')
    const selectedBounds = bounds(selected.flatMap((node) => corners(node.geometry)))
    const { x, y } = selectedBounds
    const right = x + selectedBounds.width
    const bottom = y + selectedBounds.height
    const insertion = Math.max(...selected.map((node) => first.siblings.indexOf(node)))
    const children = selected.map((node) => ({
      ...node,
      geometry: quantizeGeometry({
        ...node.geometry,
        x: node.geometry.x - x,
        y: node.geometry.y - y,
      }),
    }))
    const remaining = first.siblings.filter((node) => !nodeIds.includes(node.id))
    const before = first.siblings
      .slice(0, insertion)
      .filter((node) => !nodeIds.includes(node.id)).length
    remaining.splice(before, 0, {
      id: groupId,
      kind: 'group',
      role: 'group',
      name: 'Group',
      geometry: { x: du(x), y: du(y), width: du(right - x), height: du(bottom - y), rotation: 0 },
      layout_mode: 'fixed',
      locked: false,
      visibility: 'shown',
      optional: false,
      child_ids: children.map((node) => node.id),
      children,
    })
    first.siblings.splice(0, first.siblings.length, ...remaining)
    syncContainerIDs(d, first)
    return d
  })
export const ungroupNode = (id: string) =>
  snapshotCommand('Ungroup selection', (d) => {
    const found = locate(d, id)
    if (!found || found.node.role !== 'group' || found.node.locked)
      throw new Error('node is not an unlocked group')
    const at = found.siblings.indexOf(found.node)
    const m = geometryMatrix(found.node.geometry)
    const children = (found.node.children ?? []).map((child) => {
      const matrix = multiply(m, geometryMatrix(child.geometry))
      const rotation = child.geometry.rotation + found.node.geometry.rotation
      const position = geometryPositionFromMatrix(
        matrix,
        child.geometry.width,
        child.geometry.height,
        rotation,
      )
      return {
        ...child,
        geometry: quantizeGeometry({
          ...child.geometry,
          x: position.x,
          y: position.y,
          rotation,
        }),
      }
    })
    found.siblings.splice(at, 1, ...children)
    syncContainerIDs(d, found)
    return d
  })

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export function resizeGeometry(
  geometry: V5Geometry,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  options: { fromCenter?: boolean; preserveAspect?: boolean; minSize?: number } = {},
): V5Geometry {
  const min = options.minSize ?? 100
  const horizontal = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const vertical = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  const factor = options.fromCenter ? 2 : 1
  let width = geometry.width + horizontal * dx * factor
  let height = geometry.height + vertical * dy * factor

  if (options.preserveAspect) {
    const widthScale = horizontal ? width / geometry.width : 1
    const heightScale = vertical ? height / geometry.height : 1
    let scale = horizontal
      ? vertical && Math.abs(heightScale - 1) > Math.abs(widthScale - 1)
        ? heightScale
        : widthScale
      : heightScale
    scale = Math.max(scale, min / geometry.width, min / geometry.height)
    width = geometry.width * scale
    height = geometry.height * scale
  } else {
    width = Math.max(min, width)
    height = Math.max(min, height)
  }

  const centerX = geometry.x + geometry.width / 2
  const centerY = geometry.y + geometry.height / 2
  const x =
    options.fromCenter || (options.preserveAspect && horizontal === 0)
      ? centerX - width / 2
      : horizontal < 0
        ? geometry.x + geometry.width - width
        : geometry.x
  const y =
    options.fromCenter || (options.preserveAspect && vertical === 0)
      ? centerY - height / 2
      : vertical < 0
        ? geometry.y + geometry.height - height
        : geometry.y
  return quantizeGeometry({ ...geometry, x, y, width, height })
}
export const resizeNode = (
  id: string,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  options?: Parameters<typeof resizeGeometry>[4],
) =>
  snapshotCommand('Resize node', (d) =>
    updateNode(d, id, (node) => {
      node.geometry = resizeGeometry(node.geometry, handle, dx, dy, options)
    }),
  )
export const rotateNode = (id: string, degrees: number, snap = false) =>
  snapshotCommand('Rotate node', (d) =>
    updateNode(d, id, (node) => {
      if (node.role === 'flow-frame') throw new Error('flow frames cannot rotate')
      if (node.role === 'element' && !getV5Widget(node.kind)?.canRotate)
        throw new Error(`widget ${node.kind} cannot rotate`)
      const requested = snap ? Math.round(degrees / 15) * 15 : degrees
      const rotation = ((((requested + 180) % 360) + 360) % 360) - 180
      node.geometry = quantizeGeometry({ ...node.geometry, rotation: rotation * 100 })
    }),
  )

export const duplicateNode = (
  id: string,
  nextID: (prefix: string) => string,
  preferred?: { x: number; y: number },
) =>
  snapshotCommand('Duplicate node', (d) => {
    const source = locate(d, id)
    if (!source || source.node.locked) throw new Error('node cannot be duplicated')
    const page = d.root.pages.find((candidate) => candidate.id === source.pageId)!
    const clone = cloneNode(source.node, nextID, { x: 0, y: 0 })
    const placement = findPlacement(
      page,
      clone.geometry,
      preferred ?? { x: source.node.geometry.x + 1200, y: source.node.geometry.y + 1200 },
      page.children.filter((node) => node.id !== source.node.id).map((node) => node.geometry),
    )
    if (!placement) throw new Error('no printable placement is available')
    clone.geometry = { ...clone.geometry, x: placement.x, y: placement.y }
    const index = source.siblings.indexOf(source.node) + 1
    source.siblings.splice(index, 0, clone)
    syncContainerIDs(d, source)
    return d
  })

export const alignNodes = (
  ids: string[],
  mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom',
) =>
  snapshotCommand('Align selection', (d) => {
    if (ids.some((id) => isLockedThroughAncestors(d, id)))
      throw new Error('selection contains locked objects')
    const locations = ids.map((id) => locate(d, id))
    if (locations.some((location) => !location))
      throw new Error('selection contains a missing object')
    if (locations.some((location) => location!.siblings !== locations[0]!.siblings))
      throw new Error('alignment requires objects in the same container')
    const nodes = locations.map((location) => location!.node)
    if (nodes.length < 2) return d
    const nodeBounds = new Map(nodes.map((node) => [node.id, bounds(corners(node.geometry))]))
    const horizontal = mode === 'left' || mode === 'center-x' || mode === 'right'
    const value = horizontal
      ? mode === 'left'
        ? Math.min(...nodes.map((node) => nodeBounds.get(node.id)!.x))
        : mode === 'right'
          ? Math.max(
              ...nodes.map((node) => {
                const rect = nodeBounds.get(node.id)!
                return rect.x + rect.width
              }),
            )
          : (Math.min(...nodes.map((node) => nodeBounds.get(node.id)!.x)) +
              Math.max(
                ...nodes.map((node) => {
                  const rect = nodeBounds.get(node.id)!
                  return rect.x + rect.width
                }),
              )) /
            2
      : mode === 'top'
        ? Math.min(...nodes.map((node) => nodeBounds.get(node.id)!.y))
        : mode === 'bottom'
          ? Math.max(
              ...nodes.map((node) => {
                const rect = nodeBounds.get(node.id)!
                return rect.y + rect.height
              }),
            )
          : (Math.min(...nodes.map((node) => nodeBounds.get(node.id)!.y)) +
              Math.max(
                ...nodes.map((node) => {
                  const rect = nodeBounds.get(node.id)!
                  return rect.y + rect.height
                }),
              )) /
            2
    for (const node of nodes) {
      const rect = nodeBounds.get(node.id)!
      const current = horizontal
        ? mode === 'left'
          ? rect.x
          : mode === 'right'
            ? rect.x + rect.width
            : rect.x + rect.width / 2
        : mode === 'top'
          ? rect.y
          : mode === 'bottom'
            ? rect.y + rect.height
            : rect.y + rect.height / 2
      node.geometry = quantizeGeometry(
        horizontal
          ? { ...node.geometry, x: node.geometry.x + value - current }
          : { ...node.geometry, y: node.geometry.y + value - current },
      )
    }
    return d
  })
export const distributeNodes = (ids: string[], axis: 'x' | 'y') =>
  snapshotCommand('Distribute selection', (d) => {
    if (ids.some((id) => isLockedThroughAncestors(d, id)))
      throw new Error('selection contains locked objects')
    const locations = ids.map((id) => locate(d, id))
    if (locations.some((location) => !location))
      throw new Error('selection contains a missing object')
    if (locations.some((location) => location!.siblings !== locations[0]!.siblings))
      throw new Error('distribution requires objects in the same container')
    const nodes = locations.map((location) => location!.node)
    const rects = nodes.map((node) => {
      const rect = bounds(corners(node.geometry))
      return { id: node.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
    const positions = distribute(axis, rects)
    for (const node of nodes) {
      if (positions[node.id] !== undefined)
        node.geometry = quantizeGeometry({
          ...node.geometry,
          [axis]:
            node.geometry[axis] +
            positions[node.id] -
            rects.find((rect) => rect.id === node.id)![axis],
        })
    }
    return d
  })

/** Inserts fully-remapped nodes (and their stories) into the current page/group scope atomically. */
export const insertNodes = (
  pageId: string,
  nodes: V5Node[],
  stories: V5Story[],
  parentId?: string | null,
) =>
  snapshotCommand('Insert content', (d) => {
    const page = d.root.pages.find((candidate) => candidate.id === pageId)
    if (!page) throw new Error(`unknown page ${pageId}`)
    let target = page.children
    if (parentId) {
      const parent = findNode(page.children, parentId)
      if (!parent || parent.role !== 'group') throw new Error('paste target is not a group')
      if (isLockedThroughAncestors(d, parent.id)) throw new Error('paste target is locked')
      target = parent.children ?? (parent.children = [])
    }
    for (const story of stories) {
      if (d.stories?.some((existing) => existing.id === story.id))
        throw new Error(`duplicate story ${story.id}`)
    }
    d.stories = [...(d.stories ?? []), ...stories]
    target.push(...nodes)
    if (parentId) {
      const parent = findNode(page.children, parentId)!
      parent.child_ids = target.map((child) => child.id)
    } else page.child_ids = page.children.map((child) => child.id)
    // Stories that arrived without a referencing frame would leak; drop them.
    const referenced = new Set(
      d.root.pages.flatMap((candidate) =>
        flatten(candidate.children).flatMap((node) => (node.story_id ? [node.story_id] : [])),
      ),
    )
    const insertedStoryIds = new Set(stories.map((story) => story.id))
    d.stories = d.stories.filter(
      (story) => !insertedStoryIds.has(story.id) || referenced.has(story.id),
    )
    return d
  })

/** One-command duplicate-and-move for a whole selection; flow frames get independent stories. */
export const duplicateAndMove = (
  ids: string[],
  dx: number,
  dy: number,
  nextID: (prefix: string) => string,
) =>
  snapshotCommand('Duplicate and move', (d) => {
    for (const id of ids)
      if (isLockedThroughAncestors(d, id)) throw new Error('node cannot be duplicated')
    for (const id of ids) {
      const source = locate(d, id)
      if (!source) throw new Error(`unknown node ${id}`)
      const clone = cloneNode(source.node, nextID, { x: 0, y: 0 })
      clone.geometry = quantizeGeometry({
        ...clone.geometry,
        x: clone.geometry.x + dx,
        y: clone.geometry.y + dy,
      })
      const index = source.siblings.indexOf(source.node) + 1
      source.siblings.splice(index, 0, clone)
      syncContainerIDs(d, source)
      // Auto-continuation frames deep-copy their stories so edits stay independent;
      // manual frames keep sharing the story (tools.md §21).
      for (const cloned of flatten([clone])) {
        if (!cloned.story_id || cloned.continuation === 'manual') continue
        const story = d.stories?.find((candidate) => candidate.id === cloned.story_id)
        if (!story) continue
        const freshID = nextID('story')
        d.stories = [
          ...(d.stories ?? []),
          { ...story, id: freshID, content: JSON.parse(JSON.stringify(story.content)) },
        ]
        cloned.story_id = freshID
      }
    }
    return d
  })

/** Keyboard nudge; repeated key presses coalesce into one history entry (tools.md §9). */
export const nudgeNodes = (ids: string[], dx: number, dy: number) => {
  const command = moveNodes(ids, dx, dy)
  return { ...command, label: 'Nudge selection', coalesceKey: `nudge:${[...ids].sort().join(',')}` }
}

export const reorderExtreme = (id: string, target: 'front' | 'back') =>
  snapshotCommand(target === 'front' ? 'Bring to front' : 'Send to back', (d) => {
    const found = locate(d, id)
    if (!found) throw new Error(`unknown node ${id}`)
    if (isLockedThroughAncestors(d, id)) throw new Error('locked objects cannot be reordered')
    const from = found.siblings.indexOf(found.node)
    const [node] = found.siblings.splice(from, 1)
    found.siblings.splice(target === 'front' ? found.siblings.length : 0, 0, node)
    syncContainerIDs(d, found)
    return d
  })

// --- Pages (tools.md §16): authored pages are managed as document state -----------------

export const addPage = (pageId: string, orientation: 'portrait' | 'landscape') =>
  snapshotCommand('Add page', (d) => {
    const [width, height] =
      orientation === 'portrait' ? [A4_WIDTH_DU, A4_HEIGHT_DU] : [A4_HEIGHT_DU, A4_WIDTH_DU]
    d.root.pages.push({
      id: pageId,
      width: du(width),
      height: du(height),
      margin: { top: du(0), right: du(0), bottom: du(0), left: du(0) },
      child_ids: [],
      children: [],
      ...(d.settings.default_master_id ? { master_id: d.settings.default_master_id } : {}),
    })
    return d
  })

export const deletePage = (pageId: string) =>
  snapshotCommand('Delete page', (d) => {
    if (d.root.pages.length <= 1) throw new Error('at least one page is required')
    const index = d.root.pages.findIndex((page) => page.id === pageId)
    if (index === -1) throw new Error(`unknown page ${pageId}`)
    const page = d.root.pages[index]
    // Story cleanup is atomic: only stories with no remaining referencing frame are removed.
    const removedStories = new Set(
      page.children.flatMap((node) => (node.story_id ? [node.story_id] : [])),
    )
    d.root.pages.splice(index, 1)
    const stillReferenced = new Set(
      d.root.pages.flatMap((remaining) =>
        flatten(remaining.children).flatMap((node) => (node.story_id ? [node.story_id] : [])),
      ),
    )
    d.stories = (d.stories ?? []).filter(
      (story) => !removedStories.has(story.id) || stillReferenced.has(story.id),
    )
    return d
  })

export const duplicatePage = (
  pageId: string,
  newPageId: string,
  nextID: (prefix: string) => string,
) =>
  snapshotCommand('Duplicate page', (d) => {
    const index = d.root.pages.findIndex((page) => page.id === pageId)
    if (index === -1) throw new Error(`unknown page ${pageId}`)
    const source = d.root.pages[index]
    const stories = (d.stories ?? []).filter((story) =>
      flatten(source.children).some((node) => node.story_id === story.id),
    )
    const remapped = remapPayload(source.children, stories, nextID)
    d.stories = [...(d.stories ?? []), ...remapped.stories]
    d.root.pages.splice(index + 1, 0, {
      ...source,
      id: newPageId,
      child_ids: remapped.nodes.map((node) => node.id),
      children: remapped.nodes,
    })
    return d
  })

export const reorderPage = (pageId: string, toIndex: number) =>
  snapshotCommand('Reorder page', (d) => {
    const from = d.root.pages.findIndex((page) => page.id === pageId)
    if (from === -1) throw new Error(`unknown page ${pageId}`)
    const [page] = d.root.pages.splice(from, 1)
    d.root.pages.splice(Math.max(0, Math.min(toIndex, d.root.pages.length)), 0, page)
    return d
  })

/** Single-object alignment against the printable area (tools.md §24). */
export const alignToPage = (
  id: string,
  mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom',
) =>
  snapshotCommand('Align to page', (d) => {
    const found = locate(d, id)
    if (!found) throw new Error(`unknown node ${id}`)
    if (isLockedThroughAncestors(d, id)) throw new Error('locked objects cannot be aligned')
    const page = d.root.pages.find((candidate) => candidate.id === found.pageId)!
    const area = {
      x: page.margin.left,
      y: page.margin.top,
      width: page.width - page.margin.left - page.margin.right,
      height: page.height - page.margin.top - page.margin.bottom,
    }
    const node = found.node
    const rect = bounds(corners(node.geometry))
    const horizontal = mode === 'left' || mode === 'center-x' || mode === 'right'
    const target = horizontal
      ? mode === 'left'
        ? area.x - rect.x
        : mode === 'right'
          ? area.x + area.width - (rect.x + rect.width)
          : area.x + area.width / 2 - (rect.x + rect.width / 2)
      : mode === 'top'
        ? area.y - rect.y
        : mode === 'bottom'
          ? area.y + area.height - (rect.y + rect.height)
          : area.y + area.height / 2 - (rect.y + rect.height / 2)
    node.geometry = quantizeGeometry(
      horizontal
        ? { ...node.geometry, x: node.geometry.x + target }
        : { ...node.geometry, y: node.geometry.y + target },
    )
    return d
  })

/** Deletes a whole selection as one atomic history entry (tools.md §23). */
export const deleteNodes = (ids: string[]) =>
  snapshotCommand('Delete selection', (d) => {
    for (const id of ids) {
      const found = locate(d, id)
      if (!found) throw new Error(`unknown node ${id}`)
      if (isLockedThroughAncestors(d, id)) throw new Error(`node ${id} is locked`)
      found.siblings.splice(found.siblings.indexOf(found.node), 1)
      syncContainerIDs(d, found)
    }
    pruneUnreferencedStories(d)
    return d
  })

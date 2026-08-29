import { apply, geometryMatrix, invert, quantizeGeometry } from './geometry'
import {
  du,
  A4_HEIGHT_DU,
  A4_WIDTH_DU,
  type V5Document,
  type V5Geometry,
  type V5Node,
  type V5Story,
} from './model'
import { remapPayload } from './selectors'
import { parseV5, serializeV5 } from './serialization'
import type { V5Command } from './history'
import { cloneNode, findPlacement } from './placement'
import { getV5Widget } from './registry'
import { distribute } from './snapping'

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
  snapshotCommand('Set visibility', (d) =>
    updateNode(d, id, (node) => {
      node.visibility = visibility
    }),
  )
export const setNodeLocked = (id: string, locked: boolean) =>
  snapshotCommand('Set lock', (d) => {
    const found = locate(d, id)
    if (!found) throw new Error(`unknown node ${id}`)
    found.node.locked = locked
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
      }),
    `props:${id}`,
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
export const reparentNode = (id: string, targetGroupId: string, index?: number) =>
  snapshotCommand('Reparent node', (d) => {
    if (id === targetGroupId || isDescendant(d, targetGroupId, id))
      throw new Error('cannot reparent into own descendant')
    const source = locate(d, id),
      target = locate(d, targetGroupId)
    if (!source || !target || target.node.role !== 'group')
      throw new Error('invalid reparent target')
    if (source.node.locked || target.node.locked || source.pageId !== target.pageId)
      throw new Error('reparent target is unavailable')
    source.siblings.splice(source.siblings.indexOf(source.node), 1)
    syncContainerIDs(d, source)
    const m = invert(geometryMatrix(target.node.geometry))
    const local = apply(m, { x: source.node.geometry.x, y: source.node.geometry.y })
    source.node.geometry = quantizeGeometry({
      ...source.node.geometry,
      x: local.x,
      y: local.y,
      rotation: source.node.geometry.rotation - target.node.geometry.rotation,
    })
    const at = Math.max(
      0,
      Math.min(index ?? (target.node.children ?? []).length, (target.node.children ?? []).length),
    )
    target.node.children ??= []
    target.node.children.splice(at, 0, source.node)
    syncChildIDs(target.node)
    return d
  })

export const groupNodes = (pageId: string, nodeIds: string[], groupId: string) =>
  snapshotCommand('Group selection', (d) => {
    const page = d.root.pages.find((candidate) => candidate.id === pageId)
    if (!page || nodeIds.length < 2) throw new Error('group requires two page siblings')
    const selected = page.children.filter((node) => nodeIds.includes(node.id))
    if (selected.length !== nodeIds.length || selected.some((node) => node.locked))
      throw new Error('group requires unlocked page siblings')
    const x = Math.min(...selected.map((node) => node.geometry.x))
    const y = Math.min(...selected.map((node) => node.geometry.y))
    const right = Math.max(...selected.map((node) => node.geometry.x + node.geometry.width))
    const bottom = Math.max(...selected.map((node) => node.geometry.y + node.geometry.height))
    const insertion = Math.max(...selected.map((node) => page.children.indexOf(node)))
    const children = selected.map((node) => ({
      ...node,
      geometry: quantizeGeometry({
        ...node.geometry,
        x: node.geometry.x - x,
        y: node.geometry.y - y,
      }),
    }))
    const remaining = page.children.filter((node) => !nodeIds.includes(node.id))
    const before = page.children
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
    page.children = remaining
    page.child_ids = remaining.map((node) => node.id)
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
      const world = apply(m, { x: child.geometry.x, y: child.geometry.y })
      return {
        ...child,
        geometry: quantizeGeometry({
          ...child.geometry,
          x: world.x,
          y: world.y,
          rotation: child.geometry.rotation + found.node.geometry.rotation,
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
  let { x, y, width, height } = geometry
  const horizontal = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const vertical = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  if (options.fromCenter) {
    dx *= 2
    dy *= 2
    if (horizontal < 0) x -= dx
    if (vertical < 0) y -= dy
  }
  if (horizontal > 0) width += dx
  if (horizontal < 0) {
    x += dx
    width -= dx
  }
  if (vertical > 0) height += dy
  if (vertical < 0) {
    y += dy
    height -= dy
  }
  if (options.preserveAspect && horizontal && vertical) {
    const ratio = geometry.width / geometry.height
    if (Math.abs(dx) > Math.abs(dy)) height = width / ratio
    else width = height * ratio
  }
  if (width < min) {
    if (horizontal < 0) x -= min - width
    width = min
  }
  if (height < min) {
    if (vertical < 0) y -= min - height
    height = min
  }
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
      const rotation = snap ? Math.round(degrees / 15) * 15 : degrees
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
    const nodes = ids
      .map((id) => locate(d, id)?.node)
      .filter((node): node is V5Node => !!node && !node.locked)
    if (nodes.length < 2) return d
    const horizontal = mode === 'left' || mode === 'center-x' || mode === 'right'
    const value = horizontal
      ? mode === 'left'
        ? Math.min(...nodes.map((node) => node.geometry.x))
        : mode === 'right'
          ? Math.max(...nodes.map((node) => node.geometry.x + node.geometry.width))
          : (Math.min(...nodes.map((node) => node.geometry.x)) +
              Math.max(...nodes.map((node) => node.geometry.x + node.geometry.width))) /
            2
      : mode === 'top'
        ? Math.min(...nodes.map((node) => node.geometry.y))
        : mode === 'bottom'
          ? Math.max(...nodes.map((node) => node.geometry.y + node.geometry.height))
          : (Math.min(...nodes.map((node) => node.geometry.y)) +
              Math.max(...nodes.map((node) => node.geometry.y + node.geometry.height))) /
            2
    for (const node of nodes)
      node.geometry = quantizeGeometry(
        horizontal
          ? {
              ...node.geometry,
              x:
                mode === 'center-x'
                  ? value - node.geometry.width / 2
                  : mode === 'right'
                    ? value - node.geometry.width
                    : value,
            }
          : {
              ...node.geometry,
              y:
                mode === 'center-y'
                  ? value - node.geometry.height / 2
                  : mode === 'bottom'
                    ? value - node.geometry.height
                    : value,
            },
      )
    return d
  })
export const distributeNodes = (ids: string[], axis: 'x' | 'y') =>
  snapshotCommand('Distribute selection', (d) => {
    const nodes = ids
      .map((id) => locate(d, id)?.node)
      .filter((node): node is V5Node => !!node && !node.locked)
    const positions = distribute(
      axis,
      nodes.map((node) => ({
        id: node.id,
        x: node.geometry.x,
        y: node.geometry.y,
        width: node.geometry.width,
        height: node.geometry.height,
      })),
    )
    for (const node of nodes)
      if (positions[node.id] !== undefined)
        node.geometry = quantizeGeometry({ ...node.geometry, [axis]: positions[node.id] })
    return d
  })

/** Inserts fully-remapped nodes (and their stories) onto a page in one atomic command. */
export const insertNodes = (pageId: string, nodes: V5Node[], stories: V5Story[]) =>
  snapshotCommand('Insert content', (d) => {
    const page = d.root.pages.find((candidate) => candidate.id === pageId)
    if (!page) throw new Error(`unknown page ${pageId}`)
    const ids = new Set(nodes.map((node) => node.id))
    for (const story of stories) {
      if (d.stories?.some((existing) => existing.id === story.id))
        throw new Error(`duplicate story ${story.id}`)
    }
    d.stories = [...(d.stories ?? []), ...stories]
    page.children.push(...nodes)
    page.child_ids = page.children.map((child) => child.id)
    // Stories that arrived without a referencing frame would leak; drop them.
    const referenced = new Set(
      page.children.flatMap((node) => (node.story_id ? [node.story_id] : [])),
    )
    d.stories = d.stories.filter((story) => ids.has(story.id) === false || referenced.has(story.id))
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
        d.stories = [...(d.stories ?? []), { ...story, id: freshID, content: JSON.parse(JSON.stringify(story.content)) }]
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
    const horizontal = mode === 'left' || mode === 'center-x' || mode === 'right'
    const target = horizontal
      ? mode === 'left'
        ? area.x
        : mode === 'right'
          ? area.x + area.width - node.geometry.width
          : area.x + (area.width - node.geometry.width) / 2
      : mode === 'top'
        ? area.y
        : mode === 'bottom'
          ? area.y + area.height - node.geometry.height
          : area.y + (area.height - node.geometry.height) / 2
    node.geometry = quantizeGeometry(horizontal ? { ...node.geometry, x: target } : { ...node.geometry, y: target })
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
    return d
  })

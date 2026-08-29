import { apply, geometryMatrix, invert, quantizeGeometry } from './geometry'
import { du, type V5Document, type V5Geometry, type V5Node } from './model'
import { parseV5, serializeV5 } from './serialization'
import type { V5Command } from './history'

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
function updateNode(document: V5Document, id: string, update: (node: V5Node) => void) {
  const found = locate(document, id)
  if (!found) throw new Error(`unknown node ${id}`)
  if (found.node.locked) throw new Error(`node ${id} is locked`)
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
    for (const id of ids) {
      const found = locate(d, id)
      if (found && !found.node.locked)
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
export const deleteNode = (id: string) =>
  snapshotCommand('Delete node', (d) => {
    const found = locate(d, id)
    if (!found) throw new Error(`unknown node ${id}`)
    if (found.node.locked) throw new Error(`node ${id} is locked`)
    found.siblings.splice(found.siblings.indexOf(found.node), 1)
    syncChildIDs(found.parent)
    return d
  })
export const reorderNode = (id: string, targetIndex: number) =>
  snapshotCommand('Reorder layer', (d) => {
    const found = locate(d, id)
    if (!found) throw new Error(`unknown node ${id}`)
    const from = found.siblings.indexOf(found.node)
    const [node] = found.siblings.splice(from, 1)
    found.siblings.splice(Math.max(0, Math.min(targetIndex, found.siblings.length)), 0, node)
    syncChildIDs(found.parent)
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
    syncChildIDs(source.parent)
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
    syncChildIDs(found.parent)
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
      const rotation = snap ? Math.round(degrees / 15) * 15 : degrees
      node.geometry = quantizeGeometry({ ...node.geometry, rotation: rotation * 100 })
    }),
  )

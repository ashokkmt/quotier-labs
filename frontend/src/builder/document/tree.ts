import {
  BASIS_TOTAL,
  createId,
  isContainer,
  MAX_DOCUMENT_DEPTH,
  type BuilderNode,
  type DocumentModel,
} from './model'
import { canParent, getWidget } from '../registry/registry'

export type TreeResult = { ok: true; document: DocumentModel } | { ok: false; reason: string }
export type Side = 'left' | 'right'

const fail = (reason: string): TreeResult => ({ ok: false, reason })
const success = (document: DocumentModel): TreeResult => ({ ok: true, document })
const copy = (document: DocumentModel): DocumentModel => ({
  ...document,
  nodes: Object.fromEntries(
    Object.entries(document.nodes).map(([id, node]) => [
      id,
      {
        ...node,
        children: [...node.children],
        props: { ...node.props },
        layout: { ...node.layout },
        meta: { ...node.meta },
      },
    ]),
  ),
})

export function depth(document: DocumentModel, id: string): number {
  let current = document.nodes[id]
  let result = 0
  const seen = new Set<string>()
  while (current?.parentId) {
    if (seen.has(current.id)) return MAX_DOCUMENT_DEPTH + 1
    seen.add(current.id)
    result++
    current = document.nodes[current.parentId]
  }
  return result
}
export function subtreeIds(
  document: DocumentModel,
  id: string,
  seen = new Set<string>(),
): string[] {
  if (seen.has(id) || !document.nodes[id]) return []
  seen.add(id)
  return [id, ...document.nodes[id].children.flatMap((child) => subtreeIds(document, child, seen))]
}
export function validateDocument(document: DocumentModel): string | null {
  const root = document.nodes[document.rootId]
  if (!root || root.role !== 'root' || root.parentId !== null) return 'document root is invalid'
  const reachable = new Set<string>()
  const visit = (id: string, ancestors: Set<string>): string | null => {
    const node = document.nodes[id]
    if (!node || ancestors.has(id) || reachable.has(id))
      return 'document has a cycle, orphan, or duplicate child'
    reachable.add(id)
    if (depth(document, id) > MAX_DOCUMENT_DEPTH) return 'maximum nesting depth exceeded'
    if (!isContainer(node) && node.children.length) return 'widgets cannot contain children'
    for (const childId of node.children) {
      const child = document.nodes[childId]
      if (!child || child.parentId !== id) return 'parent and child references disagree'
      const error = visit(childId, new Set([...ancestors, id]))
      if (error) return error
    }
    return null
  }
  const error = visit(document.rootId, new Set())
  if (error) return error
  return Object.keys(document.nodes).length === reachable.size
    ? null
    : 'document has unreachable nodes'
}
export function createNode(type: string): BuilderNode | null {
  const definition = getWidget(type)
  if (!definition) return null
  const defaults = definition.defaults()
  return {
    id: createId(definition.role),
    role: definition.role,
    type,
    parentId: null,
    children: [],
    props: defaults.props ?? {},
    layout: defaults.layout ?? {},
    meta: { visible: true, optional: false, ...defaults.meta },
  }
}
function canInsert(document: DocumentModel, node: BuilderNode, parentId: string): string | null {
  const parent = document.nodes[parentId]
  if (!parent || !isContainer(parent)) return 'destination is not a container'
  const definition = getWidget(node.type)
  if (!definition || !canParent(definition, parent.role))
    return 'widget is not allowed in this destination'
  if (node.meta.locked || parent.meta.locked) return 'locked content cannot be moved'
  return null
}
export function insertNode(
  document: DocumentModel,
  node: BuilderNode,
  parentId: string,
  index?: number,
): TreeResult {
  if (document.nodes[node.id]) return fail('node id already exists')
  const reason = canInsert(document, node, parentId)
  if (reason) return fail(reason)
  const next = copy(document)
  const parent = next.nodes[parentId]
  const at = Math.max(0, Math.min(index ?? parent.children.length, parent.children.length))
  next.nodes[node.id] = { ...node, parentId, children: [] }
  parent.children.splice(at, 0, node.id)
  return validateDocument(next) ? fail(validateDocument(next)!) : success(next)
}
export function moveNode(
  document: DocumentModel,
  id: string,
  parentId: string,
  index?: number,
): TreeResult {
  const node = document.nodes[id]
  if (!node || node.role === 'root') return fail('node cannot be moved')
  if (subtreeIds(document, id).includes(parentId))
    return fail('cannot move a node into its descendant')
  const reason = canInsert(document, node, parentId)
  if (reason) return fail(reason)
  const next = copy(document)
  const oldParent = next.nodes[node.parentId!]
  const newParent = next.nodes[parentId]
  const oldIndex = oldParent.children.indexOf(id)
  oldParent.children.splice(oldIndex, 1)
  let at = index ?? newParent.children.length
  if (oldParent.id === newParent.id && oldIndex < at) at--
  newParent.children.splice(Math.max(0, Math.min(at, newParent.children.length)), 0, id)
  next.nodes[id].parentId = parentId
  return validateDocument(next) ? fail(validateDocument(next)!) : success(next)
}
export function deleteNode(document: DocumentModel, id: string): TreeResult {
  const node = document.nodes[id]
  if (!node || node.role === 'root' || node.meta.locked) return fail('node cannot be deleted')
  const next = copy(document)
  next.nodes[node.parentId!].children = next.nodes[node.parentId!].children.filter(
    (child) => child !== id,
  )
  for (const remove of subtreeIds(next, id)) delete next.nodes[remove]
  return success(normalizeGeneratedContainers(next))
}
export function duplicateSubtree(document: DocumentModel, id: string): TreeResult {
  const source = document.nodes[id]
  if (!source || !source.parentId || source.meta.locked) return fail('node cannot be duplicated')
  const next = copy(document)
  const remap = new Map<string, string>()
  for (const oldId of subtreeIds(document, id)) remap.set(oldId, createId('copy'))
  for (const oldId of subtreeIds(document, id)) {
    const old = document.nodes[oldId]
    const newId = remap.get(oldId)!
    next.nodes[newId] = {
      ...old,
      id: newId,
      parentId: oldId === id ? source.parentId : remap.get(old.parentId!)!,
      children: old.children.map((child) => remap.get(child)!),
      props: { ...old.props },
      layout: { ...old.layout },
      meta: { ...old.meta, generated: false },
    }
  }
  const parent = next.nodes[source.parentId]
  parent.children.splice(parent.children.indexOf(id) + 1, 0, remap.get(id)!)
  return validateDocument(next) ? fail(validateDocument(next)!) : success(next)
}
export function wrapBeside(
  document: DocumentModel,
  source: BuilderNode,
  targetId: string,
  side: Side,
): TreeResult {
  const target = document.nodes[targetId]
  if (!target || target.role === 'root' || !target.parentId) return fail('target cannot be wrapped')
  const sourceDefinition = getWidget(source.type)
  if (!sourceDefinition?.capabilities.horizontal)
    return fail('widget cannot be placed side by side')
  if (source.id === targetId || subtreeIds(document, source.id).includes(targetId))
    return fail('invalid side placement')
  const parent = document.nodes[target.parentId]
  if (parent.layout.direction === 'horizontal')
    return moveNode(
      document,
      source.id,
      parent.id,
      parent.children.indexOf(targetId) + (side === 'right' ? 1 : 0),
    )
  const next = copy(document)
  const targetIndex = next.nodes[parent.id].children.indexOf(targetId)
  if (next.nodes[source.id]) {
    const sourceParent = next.nodes[next.nodes[source.id].parentId!]
    sourceParent.children = sourceParent.children.filter((id) => id !== source.id)
  }
  const wrapperId = createId('container')
  next.nodes[wrapperId] = {
    id: wrapperId,
    role: 'container',
    type: 'container',
    parentId: parent.id,
    children: side === 'left' ? [source.id, targetId] : [targetId, source.id],
    props: {},
    layout: { direction: 'horizontal', gap: 'md' },
    meta: { visible: true, optional: false, generated: true },
  }
  next.nodes[targetId] = {
    ...next.nodes[targetId],
    parentId: wrapperId,
    layout: { ...next.nodes[targetId].layout, basis: BASIS_TOTAL / 2 },
  }
  next.nodes[source.id] = {
    ...source,
    parentId: wrapperId,
    children: [...source.children],
    layout: { ...source.layout, basis: BASIS_TOTAL / 2 },
  }
  next.nodes[parent.id].children[targetIndex] = wrapperId
  return validateDocument(next) ? fail(validateDocument(next)!) : success(next)
}
export function resizeSiblings(document: DocumentModel, leftId: string, basis: number): TreeResult {
  const left = document.nodes[leftId]
  const parent = left?.parentId ? document.nodes[left.parentId] : undefined
  if (!left || !parent || parent.layout.direction !== 'horizontal')
    return fail('resize requires a horizontal container')
  const index = parent.children.indexOf(leftId)
  const right = document.nodes[parent.children[index + 1]]
  if (!right) return fail('resize requires an adjacent sibling')
  const next = copy(document)
  const clamped = Math.max(1_000, Math.min(BASIS_TOTAL - 1_000, Math.round(basis)))
  next.nodes[leftId].layout.basis = clamped
  next.nodes[right.id].layout.basis = BASIS_TOTAL - clamped
  return success(next)
}
export function normalizeGeneratedContainers(document: DocumentModel): DocumentModel {
  const next = copy(document)
  for (const node of Object.values(next.nodes)) {
    if (
      node.role !== 'container' ||
      !node.meta.generated ||
      node.meta.locked ||
      Object.keys(node.props).length ||
      Object.keys(node.layout).some((key) => !['direction', 'gap'].includes(key))
    )
      continue
    if (node.children.length === 0 && node.parentId) {
      next.nodes[node.parentId].children = next.nodes[node.parentId].children.filter(
        (id) => id !== node.id,
      )
      delete next.nodes[node.id]
    }
  }
  return next
}

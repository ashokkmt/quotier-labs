import { create } from 'zustand'
import type { BuilderNode, DocumentModel } from './model'

import type { PlacementIntent } from '../geometry/placement'
export type DragSource = { type: 'create'; widget: string } | { type: 'move'; nodeId: string }
export type DragState = {
  source: DragSource
  x: number
  y: number
  resolution: PlacementIntent | null
}

type DocumentActions = {
  setDocument: (doc: DocumentModel) => void
  selectNode: (id: string | null) => void
  hoverNode: (id: string | null) => void
  addNode: (node: BuilderNode, parentId?: string, index?: number) => void
  updateNode: (id: string, update: Partial<BuilderNode>) => void
  updateProp: (id: string, key: string, value: unknown) => void
  deleteNode: (id: string) => void
  moveNode: (id: string, parentId: string, index?: number) => void
  wrapInRow: (targetId: string, newNode: BuilderNode, insertBefore: boolean) => void
  setDrag: (drag: DragState | null | ((prev: DragState | null) => DragState | null)) => void
  setDragResolution: (res: PlacementIntent | null) => void
}
export type BuilderStore = DocumentModel &
  DocumentActions & {
    selectedNodeId: string | null
    hoveredNodeId: string | null
    drag: DragState | null
  }
export const createDocument = (rootId = 'n_root'): DocumentModel => ({
  schemaVersion: 3,
  rootId,
  nodes: {
    [rootId]: {
      id: rootId,
      kind: 'root',
      widget: 'root',
      parentId: null,
      children: [],
      props: {},
      style: {},
      meta: { visible: true, optional: false },
    },
  },
})

function descendants(nodes: Record<string, BuilderNode>, id: string): string[] {
  return nodes[id].children.flatMap((child) => [child, ...descendants(nodes, child)])
}
export const useBuilderStore = create<BuilderStore>((set) => ({
  ...createDocument(),
  selectedNodeId: null,
  hoveredNodeId: null,
  drag: null,
  setDrag: (updater) =>
    set((state) => ({ drag: typeof updater === 'function' ? updater(state.drag) : updater })),
  setDragResolution: (resolution) =>
    set((state) => ({ drag: state.drag ? { ...state.drag, resolution } : null })),
  setDocument: (doc) => set({ ...doc, selectedNodeId: null, hoveredNodeId: null }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
  hoverNode: (hoveredNodeId) => set({ hoveredNodeId }),
  wrapInRow: (targetId, newNode, insertBefore) =>
    set((state) => {
      const target = state.nodes[targetId]
      if (!target || !target.parentId) return state
      const parent = state.nodes[target.parentId]
      const targetIndex = parent.children.indexOf(targetId)

      const rowId = `n_${Math.random().toString(36).substring(2, 9)}`
      const rowNode: BuilderNode = {
        id: rowId,
        kind: 'row',
        widget: 'container',
        parentId: parent.id,
        children: insertBefore ? [newNode.id, target.id] : [target.id, newNode.id],
        props: { direction: 'horizontal' },
        style: {},
        meta: { visible: true, optional: false },
      }

      const updatedTarget = {
        ...target,
        parentId: rowId,
        style: { ...target.style, width: 'half' as const },
      }
      const updatedNewNode = {
        ...newNode,
        parentId: rowId,
        style: { ...newNode.style, width: 'half' as const },
      }

      const updatedParentChildren = [...parent.children]
      updatedParentChildren[targetIndex] = rowId

      return {
        ...state,
        nodes: {
          ...state.nodes,
          [rowId]: rowNode,
          [targetId]: updatedTarget,
          [newNode.id]: updatedNewNode,
          [parent.id]: { ...parent, children: updatedParentChildren },
        },
      }
    }),
  addNode: (node, parentId, index) =>
    set((state) => {
      const parent = state.nodes[parentId ?? state.rootId]
      if (!parent) return state
      const nodes = { ...state.nodes, [node.id]: { ...node, parentId: parent.id } }
      const children = [...parent.children]
      children.splice(index ?? children.length, 0, node.id)
      nodes[parent.id] = { ...parent, children }
      return { ...state, nodes, selectedNodeId: node.id }
    }),
  updateNode: (id, update) =>
    set((state) =>
      state.nodes[id]
        ? { ...state, nodes: { ...state.nodes, [id]: { ...state.nodes[id], ...update } } }
        : state,
    ),
  updateProp: (id, key, value) =>
    set((state) =>
      state.nodes[id]
        ? {
            ...state,
            nodes: {
              ...state.nodes,
              [id]: { ...state.nodes[id], props: { ...state.nodes[id].props, [key]: value } },
            },
          }
        : state,
    ),
  deleteNode: (id) =>
    set((state) => {
      const node = state.nodes[id]
      if (!node || node.kind === 'root') return state
      const parent = node.parentId ? state.nodes[node.parentId] : undefined
      if (!parent) return state
      const nodes = { ...state.nodes }
      for (const child of [id, ...descendants(nodes, id)]) delete nodes[child]
      nodes[parent.id] = { ...parent, children: parent.children.filter((child) => child !== id) }
      return {
        ...state,
        nodes,
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      }
    }),
  moveNode: (id, parentId, index) =>
    set((state) => {
      const node = state.nodes[id]
      const parent = state.nodes[parentId]
      if (!node || !parent || id === parentId || descendants(state.nodes, id).includes(parentId))
        return state
      const oldParent = node.parentId ? state.nodes[node.parentId] : undefined
      if (!oldParent) return state
      const nodes = {
        ...state.nodes,
        [oldParent.id]: {
          ...oldParent,
          children: oldParent.children.filter((child) => child !== id),
        },
        [parent.id]: {
          ...parent,
          children: [
            ...parent.children.slice(0, index ?? parent.children.length),
            id,
            ...parent.children.slice(index ?? parent.children.length),
          ],
        },
      }
      nodes[id] = { ...node, parentId }
      return { ...state, nodes }
    }),
}))

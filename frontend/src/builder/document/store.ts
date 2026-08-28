import { create } from 'zustand'
import { createRoot, type DocumentModel } from './model'
import {
  createNode,
  deleteNode,
  duplicateSubtree,
  insertNode,
  moveNode,
  resizeSiblings,
  wrapBeside,
} from './tree'
import type { OperationPlan } from '../geometry/placement'

export type DragSource = { type: 'create'; widget: string } | { type: 'move'; nodeId: string }
export type DragState = {
  source: DragSource
  x: number
  y: number
  startX: number
  startY: number
  active: boolean
  resolution: OperationPlan | null
}
type BuilderStore = DocumentModel & {
  selectedNodeId: string | null
  hoveredNodeId: string | null
  drag: DragState | null
  clipboard: string | null
  lastError: string | null
  setDocument: (doc: DocumentModel) => void
  selectNode: (id: string | null) => void
  hoverNode: (id: string | null) => void
  setDrag: (drag: DragState | null | ((previous: DragState | null) => DragState | null)) => void
  commitPlan: (plan: OperationPlan, source: DragSource) => boolean
  deleteSelected: () => boolean
  duplicateSelected: () => boolean
  copySelected: () => boolean
  pasteIntoSelection: () => boolean
  resize: (leftId: string, basis: number) => boolean
  updateProp: (id: string, key: string, value: unknown) => void
  updateLayout: (id: string, key: string, value: unknown) => void
}
export const useBuilderStore = create<BuilderStore>((set, get) => ({
  ...createRoot(),
  selectedNodeId: null,
  hoveredNodeId: null,
  drag: null,
  clipboard: null,
  lastError: null,
  setDocument: (doc) =>
    set({
      ...doc,
      selectedNodeId: null,
      hoveredNodeId: null,
      drag: null,
      clipboard: null,
      lastError: null,
    }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
  hoverNode: (hoveredNodeId) => set({ hoveredNodeId }),
  setDrag: (updater) =>
    set((state) => ({ drag: typeof updater === 'function' ? updater(state.drag) : updater })),
  commitPlan: (plan, source) => {
    const doc = get() as DocumentModel
    const node = source.type === 'create' ? createNode(source.widget) : doc.nodes[source.nodeId]
    if (!node) {
      set({ lastError: 'unknown widget or source node' })
      return false
    }
    const result =
      plan.operation === 'wrap-beside'
        ? wrapBeside(doc, node, plan.targetId!, plan.side!)
        : source.type === 'move'
          ? moveNode(doc, node.id, plan.parentId, plan.index)
          : insertNode(doc, node, plan.parentId, plan.index)
    if (!result.ok) {
      set({ lastError: result.reason })
      return false
    }
    set({ ...result.document, selectedNodeId: node.id, drag: null, lastError: null })
    return true
  },
  deleteSelected: () => {
    const id = get().selectedNodeId
    if (!id) return false
    const result = deleteNode(get(), id)
    if (!result.ok) {
      set({ lastError: result.reason })
      return false
    }
    set({ ...result.document, selectedNodeId: null })
    return true
  },
  duplicateSelected: () => {
    const state = get()
    const source = state.selectedNodeId ? state.nodes[state.selectedNodeId] : undefined
    if (!source) return false
    const result = duplicateSubtree(state, source.id)
    if (!result.ok) {
      set({ lastError: result.reason })
      return false
    }
    const parent = result.document.nodes[source.parentId!]
    set({
      ...result.document,
      selectedNodeId: parent.children[parent.children.indexOf(source.id) + 1],
    })
    return true
  },
  copySelected: () => {
    const id = get().selectedNodeId
    if (!id || !get().nodes[id] || get().nodes[id].role === 'root') return false
    set({ clipboard: id })
    return true
  },
  pasteIntoSelection: () => {
    const state = get()
    const sourceId = state.clipboard
    if (!sourceId || !state.nodes[sourceId]) return false
    const target = state.selectedNodeId
      ? state.nodes[state.selectedNodeId]
      : state.nodes[state.rootId]
    const parentId =
      target.role === 'container' || target.role === 'root' ? target.id : target.parentId!
    const copied = duplicateSubtree(state, sourceId)
    if (!copied.ok) {
      set({ lastError: copied.reason })
      return false
    }
    const cloneId =
      copied.document.nodes[state.nodes[sourceId].parentId!].children[
        copied.document.nodes[state.nodes[sourceId].parentId!].children.indexOf(sourceId) + 1
      ]
    const moved = moveNode(copied.document, cloneId, parentId)
    if (!moved.ok) {
      set({ lastError: moved.reason })
      return false
    }
    set({ ...moved.document, selectedNodeId: cloneId })
    return true
  },
  resize: (leftId, basis) => {
    const result = resizeSiblings(get(), leftId, basis)
    if (!result.ok) {
      set({ lastError: result.reason })
      return false
    }
    set(result.document)
    return true
  },
  updateProp: (id, key, value) =>
    set((state) =>
      state.nodes[id]
        ? {
            nodes: {
              ...state.nodes,
              [id]: { ...state.nodes[id], props: { ...state.nodes[id].props, [key]: value } },
            },
          }
        : state,
    ),
  updateLayout: (id, key, value) =>
    set((state) =>
      state.nodes[id]
        ? {
            nodes: {
              ...state.nodes,
              [id]: { ...state.nodes[id], layout: { ...state.nodes[id].layout, [key]: value } },
            },
          }
        : state,
    ),
}))

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import { V5History, type V5Command } from './history'
import { serializeV5, parseV5 } from './serialization'
import { findNode, flattenNodes, remapPayload } from './selectors'
import { deleteNodes as deleteNodesCommand, insertNodes } from './commands'
import { du, type V5Document, type V5Node, type V5Story } from './model'
import type { Bounds } from './geometry'

export type V5SaveStatus = 'saved' | 'saving' | 'failed' | 'unsaved'
export type V5SessionSnapshot = {
  document: V5Document
  revision: number
  acknowledgedRevision: number
  saveStatus: V5SaveStatus
  canUndo: boolean
  canRedo: boolean
  selectedNodeId: string | null
  selectedNodeIds: string[]
  editScopeId: string | null
  activePageId: string
  zoom: number
  tool: V5Tool
  shapeVariant: V5ShapeVariant
  clipboardCount: number
}

export type V5Clipboard = { nodes: V5Node[]; stories: V5Story[] }
export type V5Tool = 'select' | 'hand' | 'text' | 'shape' | 'image' | 'table'
export type V5ShapeVariant = 'rect' | 'ellipse' | 'line' | 'square'

export class V5Session {
  private history: V5History
  private acknowledgedRevision = 0
  private saveStatus: V5SaveStatus = 'saved'
  private selectedNodeId: string | null = null
  private selectedNodeIds: string[] = []
  private editScopeId: string | null = null
  private activePageId: string
  private zoom = 0.01
  private tool: V5Tool = 'select'
  private shapeVariant: V5ShapeVariant = 'rect'
  private clipboard: V5Clipboard | null = null
  private duplicateTransform: { dx: number; dy: number } | null = null
  private idCounter = 0
  private cachedSnapshot: V5SessionSnapshot | null = null
  private listeners = new Set<() => void>()
  constructor(initial: V5Document) {
    this.history = new V5History(initial)
    this.activePageId = initial.root.pages[0].id
  }
  // useSyncExternalStore compares snapshots by identity, so this must return the same cached
  // object until the next emit; rebuilding it per call would re-render forever.
  getSnapshot = (): V5SessionSnapshot => {
    if (this.cachedSnapshot === null) {
      this.cachedSnapshot = {
        document: this.history.document,
        revision: this.history.revision,
        acknowledgedRevision: this.acknowledgedRevision,
        saveStatus: this.saveStatus,
        canUndo: this.history.canUndo,
        canRedo: this.history.canRedo,
        selectedNodeId: this.selectedNodeId,
        selectedNodeIds: this.selectedNodeIds,
        editScopeId: this.editScopeId,
        activePageId: this.activePageId,
        zoom: this.zoom,
        tool: this.tool,
        shapeVariant: this.shapeVariant,
        clipboardCount: this.clipboard?.nodes.length ?? 0,
      }
    }
    return this.cachedSnapshot
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private emit() {
    this.cachedSnapshot = null
    this.listeners.forEach((listener) => listener())
  }
  nextID = (prefix = 'node'): string => {
    this.idCounter += 1
    return `${prefix}-${crypto.randomUUID()}`
  }
  /** Drops selection entries whose objects no longer exist after a mutation. */
  private pruneSelection() {
    const alive = (id: string) =>
      this.history.document.root.pages.some((page) => findNode(page.children, id) !== null)
    this.selectedNodeIds = this.selectedNodeIds.filter(alive)
    this.selectedNodeId = this.selectedNodeIds[0] ?? null
    if (this.editScopeId && !alive(this.editScopeId)) this.editScopeId = null
  }
  execute(command: V5Command) {
    this.history.execute(command)
    this.duplicateTransform = null
    this.pruneSelection()
    this.saveStatus = 'unsaved'
    this.emit()
  }
  undo() {
    if (this.history.undo()) {
      this.duplicateTransform = null
      this.pruneSelection()
      this.saveStatus = 'unsaved'
      this.emit()
    }
  }
  redo() {
    if (this.history.redo()) {
      this.duplicateTransform = null
      this.pruneSelection()
      this.saveStatus = 'unsaved'
      this.emit()
    }
  }
  canUndo(): boolean {
    return this.history.canUndo
  }
  canRedo(): boolean {
    return this.history.canRedo
  }

  // --- viewport / page navigation (editor state only; never history or autosave) ----------

  setZoom(zoom: number) {
    this.zoom = Math.min(0.08, Math.max(0.001, zoom))
    this.emit()
  }
  setTool(tool: V5Tool) {
    this.tool = tool
    this.emit()
  }
  setShapeVariant(shapeVariant: V5ShapeVariant) {
    this.shapeVariant = shapeVariant
    this.emit()
  }
  setActivePage(id: string) {
    if (!this.history.document.root.pages.some((page) => page.id === id)) return
    this.activePageId = id
    // Selection is page/scope-local; switching pages clears it (tools.md §7).
    this.selectNode(null)
    this.emit()
  }

  // --- clipboard (editor state; payload is controlled document data only) -----------------

  copySelection(): number {
    const payload = this.gatherSelectionPayload()
    if (!payload) return 0
    this.clipboard = payload
    this.emit()
    return payload.nodes.length
  }
  cutSelection(): number {
    const payload = this.gatherSelectionPayload()
    if (!payload) return 0
    const ids = [...this.selectedNodeIds]
    this.clipboard = payload
    // One history entry for the cut's document effect (copy itself is not history).
    this.execute(deleteNodesCommand(ids))
    return payload.nodes.length
  }
  /** Pastes the clipboard; mode 'in-place' preserves coordinates or fails. */
  paste(mode: 'standard' | 'in-place', pointer?: { x: number; y: number }): string[] {
    if (!this.clipboard) return []
    const pageId = this.activePageId
    const page = this.history.document.root.pages.find((candidate) => candidate.id === pageId)
    if (!page) return []
    const remapped = remapPayload(this.clipboard.nodes, this.clipboard.stories, (prefix) =>
      this.nextID(prefix),
    )
    const union = unionBounds(remapped.nodes)
    if (mode === 'in-place') {
      if (
        union.x < 0 ||
        union.y < 0 ||
        union.x + union.width > page.width ||
        union.y + union.height > page.height
      )
        throw new Error('pasted content does not fit the page at its original position')
    } else {
      // Placement priority: pointer → viewport-center-ish margin origin → +12pt cascade handled
      // by findPlacement candidates; the whole union must stay on the page.
      const preferred = pointer ?? {
        x: du(page.margin.left + 2400),
        y: du(page.margin.top + 2400),
      }
      const target = clampUnion(page, union, preferred)
      const dx = target.x - union.x
      const dy = target.y - union.y
      for (const node of remapped.nodes)
        node.geometry = { ...node.geometry, x: node.geometry.x + dx, y: node.geometry.y + dy }
    }
    this.execute(insertNodes(pageId, remapped.nodes, remapped.stories))
    this.selectedNodeIds = remapped.nodes.map((node) => node.id)
    this.selectedNodeId = this.selectedNodeIds[0] ?? null
    this.emit()
    return this.selectedNodeIds
  }
  /** Paste position search keeping the whole union inside the page. */
  rememberDuplicateTransform(dx: number, dy: number) {
    this.duplicateTransform = { dx, dy }
  }
  recallDuplicateTransform(): { dx: number; dy: number } | null {
    return this.duplicateTransform
  }
  private gatherSelectionPayload(): V5Clipboard | null {
    if (!this.selectedNodeIds.length) return null
    const page = this.history.document.root.pages.find(
      (candidate) => candidate.id === this.activePageId,
    )
    if (!page) return null
    const nodes = page.children.filter((node) => this.selectedNodeIds.includes(node.id))
    if (!nodes.length) return null
    const ids = new Set(nodes.flatMap((node) => flattenNodes([node]).map((item) => item.id)))
    const storyIds = new Set(
      nodes.flatMap((node) =>
        flattenNodes([node]).flatMap((item) => (item.story_id ? [item.story_id] : [])),
      ),
    )
    const stories = (this.history.document.stories ?? []).filter((story) => storyIds.has(story.id))
    // Copy a deep snapshot so later edits cannot leak into the clipboard.
    const serialized = JSON.parse(JSON.stringify({ nodes, stories })) as V5Clipboard
    void ids
    return serialized
  }
  beginSave(): { revision: number; document: string } {
    this.saveStatus = 'saving'
    this.emit()
    return { revision: this.history.revision, document: serializeV5(this.history.document) }
  }
  acknowledgeSave(revision: number) {
    if (revision >= this.acknowledgedRevision) this.acknowledgedRevision = revision
    this.saveStatus = revision === this.history.revision ? 'saved' : 'unsaved'
    this.emit()
  }
  failSave() {
    this.saveStatus = 'failed'
    this.emit()
  }
  selectNode(id: string | null, additive = false) {
    this.selectedNodeId = id
    if (!id) this.selectedNodeIds = []
    else if (additive && this.selectedNodeIds.includes(id))
      this.selectedNodeIds = this.selectedNodeIds.filter((selected) => selected !== id)
    else this.selectedNodeIds = additive ? [...this.selectedNodeIds, id] : [id]
    if (!this.selectedNodeIds.length) this.selectedNodeId = null
    this.emit()
  }
  selectNodes(ids: string[]) {
    this.selectedNodeIds = [...new Set(ids)]
    this.selectedNodeId = this.selectedNodeIds[0] ?? null
    this.emit()
  }
  enterGroup(id: string) {
    this.editScopeId = id
    this.selectNode(null)
  }
  exitGroup() {
    this.editScopeId = null
    this.selectNode(null)
  }
  replaceDocument(serialized: string) {
    const next = parseV5(serialized)
    this.history = new V5History(next)
    this.acknowledgedRevision = this.history.revision
    this.saveStatus = 'saved'
    this.emit()
  }
}

const V5SessionContext = createContext<V5Session | null>(null)

function unionBounds(nodes: V5Node[]): Bounds {
  const x = Math.min(...nodes.map((node) => node.geometry.x))
  const y = Math.min(...nodes.map((node) => node.geometry.y))
  const right = Math.max(...nodes.map((node) => node.geometry.x + node.geometry.width))
  const bottom = Math.max(...nodes.map((node) => node.geometry.y + node.geometry.height))
  return { x, y, width: right - x, height: bottom - y }
}

/** Clamps a union bounds rect fully inside the page, preferring the preferred origin. */
function clampUnion(
  page: NonNullable<V5Document['root']['pages'][number]>,
  union: Bounds,
  preferred: { x: number; y: number },
): Bounds {
  const maxX = page.width - union.width
  const maxY = page.height - union.height
  if (maxX < 0 || maxY < 0) throw new Error('content does not fit the page')
  const x = Math.min(Math.max(preferred.x - union.width / 2, 0), maxX)
  const y = Math.min(Math.max(preferred.y - union.height / 2, 0), maxY)
  return { ...union, x, y }
}
export function V5SessionProvider({
  initial,
  children,
}: {
  initial: V5Document
  children: ReactNode
}) {
  const [session] = useState(() => new V5Session(initial))
  return <V5SessionContext.Provider value={session}>{children}</V5SessionContext.Provider>
}
export function useV5Session() {
  const session = useContext(V5SessionContext)
  if (!session) throw new Error('useV5Session must be used inside V5SessionProvider')
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  return {
    ...snapshot,
    execute: session.execute.bind(session),
    undo: session.undo.bind(session),
    redo: session.redo.bind(session),
    beginSave: session.beginSave.bind(session),
    acknowledgeSave: session.acknowledgeSave.bind(session),
    failSave: session.failSave.bind(session),
    replaceDocument: session.replaceDocument.bind(session),
    selectNode: session.selectNode.bind(session),
    selectNodes: session.selectNodes.bind(session),
    enterGroup: session.enterGroup.bind(session),
    exitGroup: session.exitGroup.bind(session),
    canUndo: session.canUndo.bind(session),
    canRedo: session.canRedo.bind(session),
    setZoom: session.setZoom.bind(session),
    setTool: session.setTool.bind(session),
    setShapeVariant: session.setShapeVariant.bind(session),
    setActivePage: session.setActivePage.bind(session),
    copySelection: session.copySelection.bind(session),
    cutSelection: session.cutSelection.bind(session),
    paste: session.paste.bind(session),
    nextID: session.nextID.bind(session),
    rememberDuplicateTransform: session.rememberDuplicateTransform.bind(session),
    recallDuplicateTransform: session.recallDuplicateTransform.bind(session),
  }
}

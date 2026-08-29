import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import { V5History, type V5Command } from './history'
import { serializeV5, parseV5 } from './serialization'
import type { V5Document } from './model'

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
}

export class V5Session {
  private history: V5History
  private acknowledgedRevision = 0
  private saveStatus: V5SaveStatus = 'saved'
  private selectedNodeId: string | null = null
  private selectedNodeIds: string[] = []
  private editScopeId: string | null = null
  private cachedSnapshot: V5SessionSnapshot | null = null
  private listeners = new Set<() => void>()
  constructor(initial: V5Document) {
    this.history = new V5History(initial)
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
  execute(command: V5Command) {
    this.history.execute(command)
    this.saveStatus = 'unsaved'
    this.emit()
  }
  undo() {
    if (this.history.undo()) {
      this.saveStatus = 'unsaved'
      this.emit()
    }
  }
  redo() {
    if (this.history.redo()) {
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
  }
}

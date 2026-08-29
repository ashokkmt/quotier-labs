import type { V5Document } from './model'
import { useEffect, useRef, useState } from 'react'
import { V5SessionProvider, useV5Session } from './store'
import { V5Canvas } from './Canvas'
import { LayersPanel } from './LayersPanel'
import { ToolPalette } from './ToolPalette'
import { Inspector } from './Inspector'

export type V5LayoutDiagnostic = { code: string; nodeId: string; message: string }

/** Imperative API the host uses to drive saves and history through the per-instance session. */
export type V5EngineHandle = {
  beginSave(): { revision: number; document: string }
  acknowledgeSave(revision: number): void
  failSave(): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
}

function SessionHandle({ onReady }: { onReady?: (handle: V5EngineHandle | null) => void }) {
  const session = useV5Session()
  useEffect(() => {
    onReady?.({
      beginSave: session.beginSave,
      acknowledgeSave: session.acknowledgeSave,
      failSave: session.failSave,
      undo: session.undo,
      redo: session.redo,
      canUndo: session.canUndo,
      canRedo: session.canRedo,
    })
    return () => onReady?.(null)
    // The handle is stable; session methods are live-bound by the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])
  return null
}

/** Global keyboard undo/redo scoped to the mounted V5 engine instance. */
function KeyboardShortcuts() {
  const session = useV5Session()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) session.redo()
        else session.undo()
      } else if (key === 'y') {
        event.preventDefault()
        session.redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [session])
  return null
}

/** Surfaces Go-resolved layout diagnostics for the in-progress document, debounced. */
function DiagnosticsBanner({
  document,
  resolveDiagnostics,
}: {
  document: V5Document
  resolveDiagnostics: (document: V5Document) => Promise<V5LayoutDiagnostic[]>
}) {
  const [diagnostics, setDiagnostics] = useState<V5LayoutDiagnostic[]>([])
  const latest = useRef(0)
  const resolveRef = useRef(resolveDiagnostics)
  useEffect(() => {
    resolveRef.current = resolveDiagnostics
  }, [resolveDiagnostics])
  useEffect(() => {
    const ticket = ++latest.current
    const timer = setTimeout(async () => {
      try {
        // Wails may deliver a null slice from Go; never trust the transport type.
        const resolved = await resolveRef.current(document)
        const next = Array.isArray(resolved) ? resolved : []
        if (latest.current === ticket) setDiagnostics(next)
      } catch {
        if (latest.current === ticket) setDiagnostics([])
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [document])
  if (diagnostics.length === 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute bottom-3 left-3 right-3 z-10 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950"
    >
      {diagnostics.map((diagnostic) => (
        <p key={`${diagnostic.code}-${diagnostic.nodeId}`}>{diagnostic.message}</p>
      ))}
    </div>
  )
}

/** Composition boundary for the new engine; callers opt in explicitly while V4 remains default.
 * The bridge reports exactly one change per committed revision: depending on the host's inline
 * callback identity would re-fire every render and loop the parent's setState. */
function ChangeBridge({ onChange }: { onChange?: (document: V5Document) => void }) {
  const session = useV5Session()
  const onChangeRef = useRef(onChange)
  const lastReportedRevision = useRef(session.revision)
  // Keep the latest callback in a ref without touching refs during render.
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    if (lastReportedRevision.current === session.revision) return
    lastReportedRevision.current = session.revision
    onChangeRef.current?.(session.document)
  }, [session.revision, session.document])
  return null
}

export function V5BuilderEngine({
  document,
  onChange,
  onReady,
  resolveDiagnostics,
}: {
  document: V5Document
  onChange?: (document: V5Document) => void
  onReady?: (handle: V5EngineHandle | null) => void
  resolveDiagnostics?: (document: V5Document) => Promise<V5LayoutDiagnostic[]>
}) {
  return (
    <V5SessionProvider initial={document}>
      <SessionHandle onReady={onReady} />
      <KeyboardShortcuts />
      <ChangeBridge onChange={onChange} />
      <div className="flex min-h-0 flex-1">
        <ToolPalette />
        <div className="min-h-0 w-56 shrink-0 overflow-y-auto border-r" aria-label="Layers">
          <LayersPanel />
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto">
          <V5Canvas />
          {resolveDiagnostics && <DiagnosticsBannerHost resolveDiagnostics={resolveDiagnostics} />}
        </div>
        <Inspector />
      </div>
    </V5SessionProvider>
  )
}

function DiagnosticsBannerHost({
  resolveDiagnostics,
}: {
  resolveDiagnostics: (document: V5Document) => Promise<V5LayoutDiagnostic[]>
}) {
  const session = useV5Session()
  return <DiagnosticsBanner document={session.document} resolveDiagnostics={resolveDiagnostics} />
}

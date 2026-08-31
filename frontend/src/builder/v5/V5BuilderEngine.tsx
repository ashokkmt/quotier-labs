import type { V5Document } from './model'
import { useEffect, useRef, useState } from 'react'
import { V5SessionProvider, useV5Session } from './store'
import { AlertTriangle, PanelRightClose, PanelRightOpen, X } from 'lucide-react'
import { V5Canvas } from './Canvas'
import { Inspector } from './Inspector'
import { WorkspaceRail } from './WorkspaceRail'
import { V5EditorUIProvider, useV5EditorUI } from './EditorUIState'
import { pageOf } from './selectors'

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
    // The provider owns one V5Session for the engine lifetime. useV5Session returns a fresh
    // facade for snapshots, so depending on that facade would call the host's onReady setter on
    // every render and can trap route transitions in a maximum-update loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Global keyboard undo/redo scoped to the mounted V5 engine instance; inputs own their keys. */
function KeyboardShortcuts() {
  const session = useV5Session()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
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
  const session = useV5Session()
  const { setInspectorOpen } = useV5EditorUI()
  const [diagnostics, setDiagnostics] = useState<V5LayoutDiagnostic[]>([])
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
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
        if (latest.current === ticket) {
          setDiagnostics(next)
          setFailed(false)
        }
      } catch {
        if (latest.current === ticket) {
          setDiagnostics([])
          setFailed(true)
        }
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [document])
  if (diagnostics.length === 0 && !failed) return null
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${diagnostics.length || 1} document ${diagnostics.length === 1 ? 'issue' : 'issues'}`}
        className="absolute bottom-3 left-3 z-20 flex h-8 items-center gap-2 rounded-lg border border-amber-400/70 bg-amber-50 px-2 text-xs text-amber-950 shadow-sm hover:bg-amber-100 dark:border-amber-400/50 dark:bg-amber-300/15 dark:text-amber-100 dark:hover:bg-amber-300/20"
        onClick={() => setOpen((value) => !value)}
      >
        <AlertTriangle className="h-4 w-4" />
        {diagnostics.length || 1} {diagnostics.length === 1 ? 'issue' : 'issues'}
      </button>
      {open && (
        <section
          aria-label="Document issues"
          className="absolute bottom-14 left-3 z-30 max-h-72 w-[min(20rem,calc(100%-1.5rem))] overflow-auto rounded-lg border bg-background p-2 shadow-xl"
        >
          <div className="mb-1 flex items-center justify-between px-1">
            <h3 className="text-sm font-medium">Document issues</h3>
            <button
              type="button"
              aria-label="Close issues"
              className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {failed ? (
            <p role="alert" className="rounded bg-destructive/10 p-2 text-xs text-destructive">
              Layout checks could not be refreshed. Your document remains editable.
            </p>
          ) : (
            diagnostics.map((diagnostic) => (
              <button
                key={`${diagnostic.code}-${diagnostic.nodeId}`}
                type="button"
                className="block w-full rounded-md p-2 text-left text-xs hover:bg-accent"
                onClick={() => {
                  const page = pageOf(session.document, diagnostic.nodeId)
                  if (page) session.setActivePage(page.id)
                  session.selectNode(diagnostic.nodeId)
                  setInspectorOpen(true)
                  setOpen(false)
                }}
              >
                {diagnostic.message}
              </button>
            ))
          )}
        </section>
      )}
    </>
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
      <V5EditorUIProvider>
        <SessionHandle onReady={onReady} />
        <KeyboardShortcuts />
        <ChangeBridge onChange={onChange} />
        <div data-v5-engine className="relative flex h-full w-full min-h-0 min-w-0 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <WorkspaceRail />
            <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <V5Canvas />
              {resolveDiagnostics && (
                <DiagnosticsBannerHost resolveDiagnostics={resolveDiagnostics} />
              )}
            </div>
            <InspectorDock />
          </div>
        </div>
      </V5EditorUIProvider>
    </V5SessionProvider>
  )
}

/** The inspector is discoverable but does not permanently turn the canvas into a form layout. */
function InspectorDock() {
  const { inspectorOpen: open, setInspectorOpen: setOpen } = useV5EditorUI()
  return (
    <div className="relative z-20 w-12 shrink-0 border-l bg-background/95 p-1.5">
      <button
        type="button"
        aria-label={open ? 'Close inspector' : 'Open inspector'}
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <PanelRightClose className="h-4 w-4" aria-hidden />
        ) : (
          <PanelRightOpen className="h-4 w-4" aria-hidden />
        )}
      </button>
      {open && (
        <aside className="absolute inset-y-0 right-12 flex w-80 min-h-0 flex-col border-l bg-background shadow-lg">
          <Inspector />
        </aside>
      )}
    </div>
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

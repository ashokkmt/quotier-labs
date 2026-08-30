import {
  Boxes,
  Circle,
  Image,
  Layers3,
  Minus,
  PanelLeftOpen,
  PanelsTopLeft,
  Square,
  Table2,
  Type,
} from 'lucide-react'
import { useState } from 'react'
import { V5_TOOL_PRESETS } from './tokens'
import { LayersPanel } from './LayersPanel'
import { PagesPanel } from './PagesPanel'
import { useV5EditorUI } from './EditorUIState'

/** A compact rail keeps navigation available without permanently stealing document space. */
export function WorkspaceRail() {
  const { drawer, setDrawer, toggleDrawer, libraryDrag, setLibraryDrag, requestPresetInsert } =
    useV5EditorUI()
  const [pointerStart, setPointerStart] = useState<{
    presetId: string
    x: number
    y: number
    pointerId: number
  } | null>(null)
  const button = (id: 'widgets' | 'layers' | 'pages', label: string, Icon: typeof Boxes) => (
    <button
      key={id}
      type="button"
      aria-label={label}
      aria-pressed={drawer === id}
      title={label}
      onClick={() => toggleDrawer(id)}
      className={`grid h-9 w-9 place-items-center rounded-lg transition-colors duration-75 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${drawer === id ? 'bg-accent text-primary' : 'text-muted-foreground'}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
  return (
    <div className="z-10 flex min-h-0 shrink-0 bg-background/95">
      <nav
        aria-label="Builder panels"
        className="flex w-12 flex-col items-center gap-1 border-r p-1.5 shadow-sm"
      >
        {button('widgets', 'Widgets', Boxes)}
        {button('layers', 'Layers', Layers3)}
        {button('pages', 'Pages', PanelsTopLeft)}
      </nav>
      {drawer && (
        <aside
          aria-label={`${drawer[0].toUpperCase()}${drawer.slice(1)} panel`}
          className="flex w-72 min-h-0 flex-col overflow-auto border-r bg-background shadow-sm"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium capitalize">{drawer}</p>
            <button
              type="button"
              aria-label="Close panel"
              className="rounded p-1 hover:bg-accent"
              onClick={() => setDrawer(null)}
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {drawer === 'widgets' ? (
            <div className="grid grid-cols-2 gap-2 p-3">
              {V5_TOOL_PRESETS.filter((preset) => preset.id !== 'flow-frame').map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title="Click to insert or drag onto the page"
                  className="min-h-16 rounded-lg border border-border p-2 text-left text-xs transition-colors duration-75 hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setPointerStart({
                      presetId: preset.id,
                      x: event.clientX,
                      y: event.clientY,
                      pointerId: event.pointerId,
                    })
                  }}
                  onPointerMove={(event) => {
                    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return
                    if (
                      libraryDrag ||
                      Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) >=
                        4
                    )
                      setLibraryDrag({
                        presetId: preset.id,
                        clientX: event.clientX,
                        clientY: event.clientY,
                      })
                  }}
                  onPointerUp={(event) => {
                    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return
                    const wasDrag =
                      Boolean(libraryDrag) ||
                      Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) >=
                        4
                    if (wasDrag)
                      requestPresetInsert({
                        presetId: preset.id,
                        mode: 'drop',
                        clientX: event.clientX,
                        clientY: event.clientY,
                      })
                    else requestPresetInsert({ presetId: preset.id, mode: 'click' })
                    setLibraryDrag(null)
                    setPointerStart(null)
                  }}
                  onPointerCancel={() => {
                    setLibraryDrag(null)
                    setPointerStart(null)
                  }}
                >
                  <span className="mb-2 block text-muted-foreground">
                    <PresetIcon presetId={preset.id} />
                  </span>
                  <span className="block font-medium">{preset.label}</span>
                  <span className="mt-1 block text-muted-foreground">Drag to place</span>
                </button>
              ))}
            </div>
          ) : drawer === 'layers' ? (
            <LayersPanel />
          ) : (
            <PagesPanel />
          )}
        </aside>
      )}
      {libraryDrag && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 w-28 rounded-lg border border-primary/40 bg-background/90 px-3 py-2 text-xs font-medium shadow-lg"
          style={{ left: libraryDrag.clientX + 14, top: libraryDrag.clientY + 14, opacity: 0.82 }}
        >
          {V5_TOOL_PRESETS.find((preset) => preset.id === libraryDrag.presetId)?.label}
        </div>
      )}
    </div>
  )
}

function PresetIcon({ presetId }: { presetId: string }) {
  const Icon =
    presetId.includes('text') || presetId === 'heading' || presetId === 'subheading'
      ? Type
      : presetId === 'image'
        ? Image
        : presetId === 'table'
          ? Table2
          : presetId === 'line'
            ? Minus
            : presetId === 'ellipse'
              ? Circle
              : Square
  return <Icon className="h-4 w-4" aria-hidden />
}

import {
  Circle,
  Hand,
  Image,
  Layers3,
  Minus,
  MousePointer2,
  PanelLeftOpen,
  PanelsTopLeft,
  Square,
  Table2,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { useState, type PointerEvent } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { V5_TOOL_PRESETS, type V5ToolPreset } from './tokens'
import { LayersPanel } from './LayersPanel'
import { PagesPanel } from './PagesPanel'
import { useV5EditorUI, type V5Drawer } from './EditorUIState'
import { useV5Session, type V5Tool } from './store'

const textPresets = V5_TOOL_PRESETS.filter((preset) =>
  ['heading', 'subheading', 'body-text'].includes(preset.id),
)
const shapePresets = V5_TOOL_PRESETS.filter((preset) =>
  ['rect', 'ellipse', 'line', 'outline-box'].includes(preset.id),
)

/** Fixed screen-space tool rail. Creation variants are grouped; document panels stay separate. */
export function WorkspaceRail() {
  const session = useV5Session()
  const ui = useV5EditorUI()
  const [tableSize, setTableSize] = useState({ rows: 2, columns: 2 })
  const [pointerStart, setPointerStart] = useState<{
    presetId: string
    x: number
    y: number
    pointerId: number
  } | null>(null)

  const chooseTool = (tool: V5Tool) => {
    ui.setDrawer(null)
    session.setTool(tool)
  }
  const togglePalette = (drawer: Exclude<V5Drawer, null>, tool: V5Tool) => {
    session.setTool(tool)
    ui.toggleDrawer(drawer)
  }
  const startPreset = (preset: V5ToolPreset, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setPointerStart({
      presetId: preset.id,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    })
  }
  const movePreset = (event: PointerEvent<HTMLButtonElement>) => {
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return
    if (
      ui.libraryDrag ||
      Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) >= 4
    )
      ui.setLibraryDrag({
        presetId: pointerStart.presetId,
        clientX: event.clientX,
        clientY: event.clientY,
      })
  }
  const finishPreset = (event: PointerEvent<HTMLButtonElement>) => {
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return
    const dragged =
      Boolean(ui.libraryDrag) ||
      Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) >= 4
    ui.requestPresetInsert(
      dragged
        ? {
            presetId: pointerStart.presetId,
            mode: 'drop',
            clientX: event.clientX,
            clientY: event.clientY,
          }
        : { presetId: pointerStart.presetId, mode: 'click' },
    )
    ui.setLibraryDrag(null)
    setPointerStart(null)
  }
  const cancelPreset = () => {
    ui.setLibraryDrag(null)
    setPointerStart(null)
  }

  return (
    <TooltipProvider delayDuration={450}>
      <div
        data-v5-editor-chrome
        className="relative z-20 flex w-12 min-h-0 shrink-0 bg-background/95"
      >
        <nav
          aria-label="Canvas tools"
          className="flex w-12 flex-col items-center gap-1 border-r p-1.5 shadow-sm"
        >
          <RailButton
            label="Select"
            shortcut="V"
            icon={MousePointer2}
            active={session.tool === 'select'}
            onClick={() => chooseTool('select')}
          />
          <RailButton
            label="Hand"
            shortcut="H / Space"
            icon={Hand}
            active={session.tool === 'hand'}
            onClick={() => chooseTool('hand')}
          />
          <span aria-hidden className="my-1 h-px w-6 bg-border" />
          <RailButton
            label="Text"
            shortcut="T"
            icon={Type}
            active={session.tool === 'text' || ui.drawer === 'text'}
            onClick={() => togglePalette('text', 'text')}
          />
          <RailButton
            label="Shape"
            shortcut="R"
            icon={Square}
            active={session.tool === 'shape' || ui.drawer === 'shape'}
            onClick={() => togglePalette('shape', 'shape')}
          />
          <RailButton
            label="Image"
            shortcut="I"
            icon={Image}
            active={session.tool === 'image'}
            onClick={() => chooseTool('image')}
          />
          <RailButton
            label="Table"
            shortcut="F"
            icon={Table2}
            active={session.tool === 'table' || ui.drawer === 'table'}
            onClick={() => togglePalette('table', 'table')}
          />
          <span aria-hidden className="my-1 h-px w-6 bg-border" />
          <RailButton
            label="Layers"
            icon={Layers3}
            active={ui.drawer === 'layers'}
            onClick={() => ui.toggleDrawer('layers')}
          />
          <RailButton
            label="Pages"
            icon={PanelsTopLeft}
            active={ui.drawer === 'pages'}
            onClick={() => ui.toggleDrawer('pages')}
          />
        </nav>

        {ui.drawer && (
          <aside
            aria-label={`${drawerTitle(ui.drawer)} panel`}
            className="absolute inset-y-0 left-12 flex w-72 min-h-0 flex-col overflow-auto border-r bg-background shadow-lg"
          >
            <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
              <p className="text-sm font-medium">{drawerTitle(ui.drawer)}</p>
              <button
                type="button"
                aria-label="Close panel"
                className="rounded p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => ui.setDrawer(null)}
              >
                <PanelLeftOpen className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {ui.drawer === 'text' ? (
              <PresetList
                presets={textPresets}
                onPointerDown={startPreset}
                onPointerMove={movePreset}
                onPointerUp={finishPreset}
                onPointerCancel={cancelPreset}
                text
              />
            ) : ui.drawer === 'shape' ? (
              <PresetList
                presets={shapePresets}
                onPointerDown={startPreset}
                onPointerMove={movePreset}
                onPointerUp={finishPreset}
                onPointerCancel={cancelPreset}
              />
            ) : ui.drawer === 'table' ? (
              <div className="space-y-4 p-3">
                <p className="text-xs text-muted-foreground">
                  Create a blank table. Header styling can be enabled later without inserting text.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Rows"
                    value={tableSize.rows}
                    min={1}
                    max={50}
                    onChange={(rows) => setTableSize((value) => ({ ...value, rows }))}
                  />
                  <NumberField
                    label="Columns"
                    value={tableSize.columns}
                    min={1}
                    max={12}
                    onChange={(columns) => setTableSize((value) => ({ ...value, columns }))}
                  />
                </div>
                <div
                  aria-hidden
                  className="grid aspect-[1.7] overflow-hidden rounded-md border"
                  style={{ gridTemplateColumns: `repeat(${tableSize.columns}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: tableSize.rows * tableSize.columns }, (_, index) => (
                    <span key={index} className="border-b border-r bg-muted/20" />
                  ))}
                </div>
                <button
                  type="button"
                  className="h-9 w-full rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    ui.requestPresetInsert({
                      presetId: 'table',
                      mode: 'click',
                      tableRows: tableSize.rows,
                      tableColumns: tableSize.columns,
                    })
                    ui.setDrawer(null)
                  }}
                >
                  Insert {tableSize.rows} × {tableSize.columns} table
                </button>
                <p className="text-xs text-muted-foreground">
                  Or drag on the page with the Table tool to place a 2 × 2 table.
                </p>
              </div>
            ) : ui.drawer === 'layers' ? (
              <LayersPanel />
            ) : (
              <PagesPanel />
            )}
          </aside>
        )}
        {ui.libraryDrag && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-50 w-28 rounded-lg border border-primary/40 bg-background/90 px-3 py-2 text-xs font-medium shadow-lg"
            style={{
              left: ui.libraryDrag.clientX + 14,
              top: ui.libraryDrag.clientY + 14,
              opacity: 0.82,
            }}
          >
            {V5_TOOL_PRESETS.find((preset) => preset.id === ui.libraryDrag?.presetId)?.label}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

function RailButton({
  label,
  shortcut,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  shortcut?: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          className={`grid h-9 w-9 place-items-center rounded-lg transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
          onClick={onClick}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {shortcut ? ` · ${shortcut}` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

function PresetList({
  presets,
  text,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  presets: V5ToolPreset[]
  text?: boolean
  onPointerDown: (preset: V5ToolPreset, event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: () => void
}) {
  return (
    <div className="space-y-1 p-2">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={(event) => onPointerDown(preset, event)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <PresetIcon presetId={preset.id} />
          <span
            className="min-w-0 flex-1"
            style={
              text
                ? {
                    fontSize: Math.min(18, Number(preset.props?.fontSize ?? 11)),
                    fontWeight: preset.props?.bold ? 700 : 400,
                  }
                : undefined
            }
          >
            {preset.label}
          </span>
          <span className="text-[10px] text-muted-foreground">Drag</span>
        </button>
      ))}
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        min={min}
        max={max}
        onChange={(event) =>
          onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))
        }
      />
    </label>
  )
}

function drawerTitle(drawer: Exclude<V5Drawer, null>) {
  return drawer === 'text'
    ? 'Text'
    : drawer === 'shape'
      ? 'Shapes'
      : drawer === 'table'
        ? 'Table'
        : drawer === 'layers'
          ? 'Layers'
          : 'Pages'
}

function PresetIcon({ presetId }: { presetId: string }) {
  const Icon =
    presetId.includes('text') || presetId === 'heading' || presetId === 'subheading'
      ? Type
      : presetId === 'line'
        ? Minus
        : presetId === 'ellipse'
          ? Circle
          : Square
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
}

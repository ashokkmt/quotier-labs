import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Check,
  Copy,
  Group,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Settings2,
  Italic,
  Underline,
  Table2,
  Type,
  Ungroup,
  Unlock,
} from 'lucide-react'
import {
  deleteNodes,
  insertNode,
  insertStoryFrame,
  duplicateAndMove,
  groupNodes,
  moveNodes,
  nudgeNodes,
  reorderExtreme,
  reorderNode,
  resizeGeometry,
  rotateNode,
  setNodeLocked,
  setNodesLocked,
  setNodesVisibility,
  ungroupNode,
  updateNodeGeometry,
  updateNodeGeometryAndProps,
  updateNodeProps,
  updateTextContentAndGeometry,
  updateTableContent,
  alignNodes,
  alignToPage,
  addPage,
  duplicatePage,
  distributeNodes,
  type ResizeHandle,
} from './commands'
import {
  apply,
  bounds as boundsForPoints,
  corners,
  geometryMatrix,
  geometryPositionFromMatrix,
  identity,
  multiply,
  polygonsOverlap,
  rectPolygon,
  resizeKeepingTopLeft,
  type Bounds,
  type Point,
} from './geometry'
import { HoverOutline, MemberSelectionOutline, SelectionOverlay } from './SelectionOverlay'
import { useV5Session } from './store'
import {
  V5_FONT_FAMILIES,
  V5_FONT_FAMILY_CSS,
  colorValueToCSS,
  defaultShapeProps,
  defaultTextProps,
  fitIntrinsicTextHeight,
  V5_TOOL_PRESETS,
  V5_TEXT_PADDING_X_PT,
  V5_TEXT_PADDING_Y_PT,
  V5_TEXT_INLINE_SAFETY_PT,
  type V5ToolPreset,
  type V5ShapeProps,
  type V5TextProps,
} from './tokens'
import { ColorPicker } from './ColorPicker'
import { fitImageSize, readValidatedImage } from './imageAssets'
import { RecordDiagnosticsOperation } from '../../../wailsjs/go/wails/DiagnosticsHandler'
import { createStory } from './stories'
import {
  ancestorChain,
  findNode,
  flattenNodes,
  isEffectivelyHidden,
  isEffectivelyLocked,
  pageDeltaToParent,
} from './selectors'
import type { V5Tool } from './store'
import {
  guidesAtExactPosition,
  snapRect,
  snapResize,
  type SnapGuide,
  type SnapRect,
} from './snapping'
import { du, type V5Geometry, type V5Node, type V5Story } from './model'
import { ContextToolbar, MenuItems, type ToolbarAction } from './ContextToolbar'
import { useAnchoredToolbar } from './toolbarPosition'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { getV5Widget } from './registry'
import { useV5EditorUI } from './EditorUIState'
import { anchorAt, contentPointForAnchor, layoutPageStack } from './pageStack'
import { findPlacement } from './placement'
import { measureIntrinsicTextGeometry } from './textMeasure'
import {
  createBlankTable,
  DU_PER_MM,
  insertTableColumn,
  insertTableRow,
  normalizeTableData,
  removeTableColumn,
  removeTableRow,
  resolvedTableColumnWidths,
  TABLE_BODY_FILL,
  TABLE_BORDER_COLOR,
  TABLE_BORDER_WIDTH_PT,
  TABLE_CELL_PADDING_X_PT,
  TABLE_CELL_PADDING_Y_PT,
  TABLE_FONT_SIZE_PT,
  TABLE_HEADER_FILL,
  TABLE_MIN_COLUMN_WIDTH_MM,
  TABLE_TEXT_COLOR,
  tableCellAtPoint,
  tableHeightDU,
} from './table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const MOVE_THRESHOLD_PX = 4
const SNAP_SCREEN_PX = 6

type Gesture =
  | {
      kind: 'move'
      ids: string[]
      ownerId: string
      pageId: string
      startClient: Point
      startScroll: Point
      base: Map<string, Point>
      worldBounds: Map<string, Bounds>
      duplicate: boolean
      toggleOnClick: boolean
      /** A click selects; only crossing the screen threshold starts a move preview/commit. */
      activated: boolean
    }
  | {
      kind: 'resize'
      id: string
      handle: ResizeHandle
      startClient: Point
      startScroll: Point
      geometry: V5Geometry
    }
  | { kind: 'rotate'; id: string; geometry: V5Geometry }
  | { kind: 'pan'; startClient: Point; startScroll: Point }
  | { kind: 'place'; pageId: string; startDoc: Point; currentDoc: Point }

type Marquee = {
  pageId: string
  startDoc: Point
  currentDoc: Point
  additive: boolean
  base: string[]
  activated: boolean
}

/** Editor projection of controlled props. Points map to pixels via pt-per-px = zoom * 100. */
const ptToPx = (pt: number, zoom: number) => pt * zoom * 100

function shapeStyle(node: V5Node, zoom: number): CSSProperties {
  const props = node.props as unknown as V5ShapeProps
  const fill = props.fill && props.fill !== 'none' ? colorValueToCSS(props.fill) : 'transparent'
  const stroke =
    props.stroke && props.stroke !== 'none' ? colorValueToCSS(props.stroke) : 'transparent'
  const widthPt = Number(props.strokeWidth ?? 1)
  const style = String(props.strokeStyle ?? 'solid')
  return {
    background: fill,
    ...(props.variant === 'ellipse'
      ? { borderRadius: '50%', border: `${ptToPx(widthPt, zoom)}px ${style} ${stroke}` }
      : props.variant === 'line'
        ? {
            background: 'transparent',
            borderTop: `${ptToPx(widthPt, zoom)}px ${style} ${stroke}`,
            height: 0,
            marginTop: (node.geometry.height * zoom) / 2,
          }
        : {
            border: `${ptToPx(widthPt, zoom)}px ${style} ${stroke}`,
            borderRadius: ptToPx(Number(props.cornerRadius ?? 0), zoom),
          }),
  }
}

function renderText(node: V5Node, zoom: number) {
  const props = node.props as unknown as V5TextProps
  const color = colorValueToCSS(props.color ?? 'black')
  const fontWeight = Number(props.fontWeight ?? (props.bold ? 700 : 400))
  return (
    <span
      style={{
        display: 'flex',
        alignItems:
          props.verticalAlign === 'bottom'
            ? 'flex-end'
            : props.verticalAlign === 'middle'
              ? 'center'
              : 'flex-start',
        color,
        fontSize: ptToPx(Number(props.fontSize ?? 11), zoom),
        fontFamily: V5_FONT_FAMILY_CSS[props.fontFamily ?? 'sans'],
        fontWeight,
        fontStyle: props.italic ? 'italic' : 'normal',
        fontKerning: 'none',
        fontVariantLigatures: 'none',
        fontFeatureSettings: '"kern" 0, "liga" 0',
        textDecoration: props.underline ? 'underline' : 'none',
        lineHeight: 1.2,
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: `${ptToPx(V5_TEXT_PADDING_Y_PT, zoom)}px ${ptToPx(V5_TEXT_PADDING_X_PT, zoom)}px`,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          display: 'block',
          width: '100%',
          textAlign: (props.align ?? 'left') as 'left' | 'center' | 'right',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
        }}
      >
        {String(props.text ?? '')}
      </span>
    </span>
  )
}

function NodeView({
  node,
  zoom,
  preview,
  previews,
  editing,
  interactiveIds,
  hiddenIds,
  stories,
  onPointerDown,
  onDoubleClick,
}: {
  node: V5Node
  zoom: number
  preview?: { x: number; y: number; rotation?: number; width?: number; height?: number }
  previews: Record<
    string,
    { x: number; y: number; rotation?: number; width?: number; height?: number }
  >
  editing?: boolean
  interactiveIds: Set<string>
  hiddenIds: Set<string>
  stories: V5Story[]
  onPointerDown: (node: V5Node, event: ReactPointerEvent<HTMLDivElement>) => void
  onDoubleClick: (node: V5Node, event: ReactMouseEvent<HTMLDivElement>) => void
}) {
  const g = node.geometry
  const x = preview?.x ?? g.x
  const y = preview?.y ?? g.y
  const width = preview?.width ?? g.width
  const height = preview?.height ?? g.height
  const rotation = preview?.rotation ?? g.rotation
  const locked = node.locked
  const interactive = interactiveIds.has(node.id)
  return (
    <div
      data-v5-node-id={node.id}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? -1 : undefined}
      aria-label={node.name ?? node.kind}
      aria-pressed={interactive ? false : undefined}
      onPointerDown={interactive ? (event) => onPointerDown(node, event) : undefined}
      onDoubleClick={interactive ? (event) => onDoubleClick(node, event) : undefined}
      style={{
        position: 'absolute',
        left: x * zoom,
        top: y * zoom,
        width: width * zoom,
        height: height * zoom,
        transform: `rotate(${rotation / 100}deg)`,
        cursor: interactive ? (locked ? 'not-allowed' : 'move') : 'default',
        userSelect: 'none',
        overflow: node.kind === 'text' || node.role === 'flow-frame' ? 'hidden' : undefined,
      }}
    >
      {editing ? null : node.kind === 'text' ? (
        renderText(node, zoom)
      ) : node.kind === 'shape' ? (
        <div
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            ...shapeStyle(node, zoom),
          }}
        />
      ) : node.kind === 'table' || node.role === 'flow-frame' ? (
        <FlowFrameContent
          story={stories.find((story) => story.id === node.story_id)}
          zoom={zoom}
          widthDU={width}
        />
      ) : node.kind === 'image' ? (
        node.props?.source ? (
          <img
            src={String(node.props.source)}
            alt={node.name ?? 'Image'}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: 'contain',
              objectPosition: 'center',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              height: '100%',
              color: '#9ca3af',
              pointerEvents: 'none',
            }}
          >
            Image
          </span>
        )
      ) : null}
      {node.children
        ?.filter((child) => !hiddenIds.has(child.id))
        .map((child) => (
          <NodeView
            key={child.id}
            node={child}
            zoom={zoom}
            preview={previews[child.id]}
            previews={previews}
            interactiveIds={interactiveIds}
            hiddenIds={hiddenIds}
            stories={stories}
            onPointerDown={onPointerDown}
            onDoubleClick={onDoubleClick}
          />
        ))}
    </div>
  )
}

function FlowFrameContent({
  story,
  zoom,
  widthDU,
}: {
  story?: V5Story
  zoom: number
  widthDU: number
}) {
  if (!story) return null
  if (story.kind === 'rich-text') {
    const value =
      typeof story.content === 'string'
        ? story.content
        : typeof (story.content as { text?: unknown } | null)?.text === 'string'
          ? String((story.content as { text: string }).text)
          : ''
    return (
      <span
        style={{
          display: 'block',
          whiteSpace: 'pre-wrap',
          fontSize: ptToPx(10, zoom),
          pointerEvents: 'none',
        }}
      >
        {value}
      </span>
    )
  }
  return <TableSurface table={normalizeTableData(story.content)} zoom={zoom} widthDU={widthDU} />
}

type TableCellPosition = { row: number; column: number }
type TableCellSelection = { axis: 'row' | 'column'; index: number }

function TableSurface({
  table,
  zoom,
  widthDU,
  editing = false,
  activeCell,
  cellSelection,
  onActiveCellChange,
  onUpdate,
  onExit,
  onCellContextMenu,
}: {
  table: ReturnType<typeof normalizeTableData>
  zoom: number
  widthDU: number
  editing?: boolean
  activeCell?: TableCellPosition | null
  cellSelection?: TableCellSelection | null
  onActiveCellChange?: (cell: TableCellPosition) => void
  onUpdate?: (table: ReturnType<typeof normalizeTableData>) => void
  onExit?: () => void
  onCellContextMenu?: (event: ReactMouseEvent<HTMLInputElement>, cell: TableCellPosition) => void
}) {
  const rows = [
    ...(table.header_enabled ? [{ row: -1, header: true, values: table.headers }] : []),
    ...table.rows.map((values, row) => ({ row, header: false, values })),
  ]
  const border = `${Math.max(0.5, ptToPx(TABLE_BORDER_WIDTH_PT, zoom))}px solid ${TABLE_BORDER_COLOR}`
  const columnWidths = resolvedTableColumnWidths(table, widthDU)
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columnWidths.map((width) => `${width * zoom}px`).join(' '),
        gridAutoRows: `${table.row_height_mm * DU_PER_MM * zoom}px`,
        width: '100%',
        height: '100%',
        color: TABLE_TEXT_COLOR,
        fontFamily: V5_FONT_FAMILY_CSS.sans,
        fontSize: ptToPx(TABLE_FONT_SIZE_PT, zoom),
        lineHeight: 1.2,
        pointerEvents: editing ? 'auto' : 'none',
        overflow: 'hidden',
      }}
    >
      {rows.flatMap((row, visualRow) =>
        Array.from({ length: table.column_count }, (_, column) => {
          const cell = { row: row.row, column }
          const selectedByScope =
            cellSelection?.axis === 'column'
              ? cellSelection.index === column
              : cellSelection?.axis === 'row' && cellSelection.index === row.row
          const style: CSSProperties = {
            minWidth: 0,
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            padding: `${ptToPx(TABLE_CELL_PADDING_Y_PT, zoom)}px ${ptToPx(TABLE_CELL_PADDING_X_PT, zoom)}px`,
            borderRight: border,
            borderBottom: border,
            borderTop: visualRow === 0 ? border : undefined,
            borderLeft: column === 0 ? border : undefined,
            borderRadius: 0,
            background: row.header ? TABLE_HEADER_FILL : TABLE_BODY_FILL,
            color: TABLE_TEXT_COLOR,
            font: 'inherit',
            fontWeight: row.header ? 600 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'pre-wrap',
          }
          if (!editing)
            return (
              <span key={`${row.row}-${column}`} style={style}>
                {row.values[column] ?? ''}
              </span>
            )
          return (
            <input
              key={`${row.row}-${column}`}
              data-v5-table-cell
              aria-label={`${row.header ? 'Header' : `Row ${row.row + 1}`}, column ${column + 1}`}
              autoFocus={
                activeCell
                  ? activeCell.row === row.row && activeCell.column === column
                  : visualRow === 0 && column === 0
              }
              value={row.values[column] ?? ''}
              style={{
                ...style,
                outline:
                  activeCell?.row === row.row && activeCell.column === column
                    ? '2px solid #2563eb'
                    : 'none',
                outlineOffset: -2,
                boxShadow: selectedByScope ? 'inset 0 0 0 2px rgb(37 99 235 / .35)' : undefined,
              }}
              aria-selected={selectedByScope || undefined}
              onFocus={() => onActiveCellChange?.(cell)}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => onCellContextMenu?.(event, cell)}
              onChange={(event) => {
                const next = normalizeTableData(table)
                if (row.header) next.headers[column] = event.target.value
                else next.rows[row.row][column] = event.target.value
                onUpdate?.(next)
              }}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Tab') {
                  event.preventDefault()
                  const cells = Array.from(
                    event.currentTarget.parentElement?.querySelectorAll<HTMLInputElement>(
                      '[data-v5-table-cell]',
                    ) ?? [],
                  )
                  const current = cells.indexOf(event.currentTarget)
                  const delta = event.shiftKey ? -1 : 1
                  const next = cells[(current + delta + cells.length) % cells.length]
                  next?.focus()
                  next?.select()
                  return
                }
                if (event.key === 'Escape' || event.key === 'Enter') {
                  event.preventDefault()
                  onExit?.()
                }
              }}
            />
          )
        }),
      )}
    </div>
  )
}

function TableEditor({
  node,
  story,
  zoom,
  onUpdate,
  onExit,
  activeCell,
  cellSelection,
  onActiveCellChange,
  onCellContextMenu,
}: {
  node: V5Node
  story: V5Story
  zoom: number
  onUpdate: (table: ReturnType<typeof normalizeTableData>) => void
  onExit: () => void
  activeCell: TableCellPosition | null
  cellSelection: TableCellSelection | null
  onActiveCellChange: (cell: TableCellPosition) => void
  onCellContextMenu: (event: ReactMouseEvent<HTMLInputElement>, cell: TableCellPosition) => void
}) {
  const table = normalizeTableData(story.content)
  const [dividerDrag, setDividerDrag] = useState<{
    index: number
    startX: number
    left: number
    right: number
    widths: number[]
  } | null>(null)
  const [dividerLabel, setDividerLabel] = useState<string | null>(null)
  useEffect(() => {
    if (!dividerDrag) return
    const owner = document.defaultView
    if (!owner) return
    const move = (event: globalThis.PointerEvent) => {
      const minimum = TABLE_MIN_COLUMN_WIDTH_MM * DU_PER_MM
      const total = dividerDrag.left + dividerDrag.right
      const nextLeft = Math.max(
        minimum,
        Math.min(total - minimum, dividerDrag.left + (event.clientX - dividerDrag.startX) / zoom),
      )
      const next = normalizeTableData(table)
      next.column_widths = [...dividerDrag.widths]
      next.column_widths[dividerDrag.index] = du(nextLeft)
      next.column_widths[dividerDrag.index + 1] = du(total - nextLeft)
      setDividerLabel(`${Math.round((nextLeft / DU_PER_MM) * 10) / 10} mm`)
      onUpdate(next)
    }
    const finish = () => {
      setDividerDrag(null)
      window.setTimeout(() => setDividerLabel(null), 350)
    }
    owner.addEventListener('pointermove', move)
    owner.addEventListener('pointerup', finish, { once: true })
    owner.addEventListener('pointercancel', finish, { once: true })
    return () => {
      owner.removeEventListener('pointermove', move)
      owner.removeEventListener('pointerup', finish)
      owner.removeEventListener('pointercancel', finish)
    }
  }, [dividerDrag, onUpdate, table, zoom])
  const displayWidths = resolvedTableColumnWidths(table, node.geometry.width)
  return (
    <div
      data-v5-table-editor
      style={{
        position: 'absolute',
        left: node.geometry.x * zoom,
        top: node.geometry.y * zoom,
        width: node.geometry.width * zoom,
        height: node.geometry.height * zoom,
        transform: node.geometry.rotation
          ? `rotate(${node.geometry.rotation / 100}deg)`
          : undefined,
        transformOrigin: 'center',
        zIndex: 8,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <TableSurface
        table={table}
        zoom={zoom}
        widthDU={node.geometry.width}
        editing
        activeCell={activeCell}
        cellSelection={cellSelection}
        onActiveCellChange={onActiveCellChange}
        onUpdate={onUpdate}
        onExit={onExit}
        onCellContextMenu={onCellContextMenu}
      />
      {displayWidths.slice(0, -1).map((_, index) => {
        const left = displayWidths.slice(0, index + 1).reduce((sum, width) => sum + width, 0)
        return (
          <button
            key={`divider-${index}`}
            type="button"
            aria-label={`Resize columns ${index + 1} and ${index + 2}`}
            className="group absolute top-0 z-20 h-full w-3 -translate-x-1/2 cursor-col-resize bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ left: left * zoom }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              setDividerDrag({
                index,
                startX: event.clientX,
                left: displayWidths[index],
                right: displayWidths[index + 1],
                widths: displayWidths,
              })
            }}
          >
            <span className="mx-auto block h-full w-px bg-transparent group-hover:bg-primary group-focus-visible:bg-primary" />
          </button>
        )
      })}
      {dividerLabel && (
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[11px] text-background shadow-sm">
          {dividerLabel}
        </span>
      )}
    </div>
  )
}

function TextEditor({
  node,
  geometry,
  zoom,
  value,
  onChange,
  onCommit,
  onCancel,
  onAutoFrame,
}: {
  node: V5Node
  geometry: V5Geometry
  zoom: number
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  onAutoFrame: (frame: { widthPx: number; heightPx: number }) => void
}) {
  const props = node.props as unknown as V5TextProps
  const color = colorValueToCSS(props.color ?? 'black')
  const ref = useRef<HTMLTextAreaElement>(null)
  const [composing, setComposing] = useState(false)
  const measureContentFrame = () => {
    const element = ref.current
    if (!element) return null
    const sizingMode = props.sizingMode ?? 'fixed-width'
    const renderedHeight = element.style.height
    const renderedWidth = element.style.width
    // Measure the glyph content, not the authored box. Measuring scrollHeight while the
    // textarea is set to the current intrinsic height makes every pass grow by its padding.
    element.style.height = '1px'
    if (sizingMode === 'auto-width') element.style.width = '1px'
    const measured = { widthPx: element.scrollWidth, heightPx: element.scrollHeight }
    element.style.height = renderedHeight
    element.style.width = renderedWidth
    return measured
  }
  // Canva-style intrinsic growth: the box follows the typed content every keystroke.
  useLayoutEffect(() => {
    if (composing) return
    const frame = measureContentFrame()
    if (frame !== null) onAutoFrame(frame)
    // measureContentFrame is intentionally local to the mounted textarea; only text/style
    // changes should trigger a fresh document measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, composing, onAutoFrame])
  return (
    <textarea
      ref={ref}
      aria-label="Edit text"
      data-v5-text-editor
      autoFocus
      value={value}
      wrap={(props.sizingMode ?? 'fixed-width') === 'auto-width' ? 'off' : 'soft'}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onChange(event.target.value)}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => {
        setComposing(false)
        const frame = measureContentFrame()
        if (frame !== null) onAutoFrame(frame)
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as HTMLElement | null
        if (!next?.closest('[data-v5-text-formatting]')) onCommit()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.nativeEvent.isComposing || composing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          onCommit()
        }
      }}
      style={{
        position: 'absolute',
        left: geometry.x * zoom,
        top: geometry.y * zoom,
        width: geometry.width * zoom,
        height: geometry.height * zoom,
        fontSize: ptToPx(Number(props.fontSize ?? 11), zoom),
        fontWeight: Number(props.fontWeight ?? (props.bold ? 700 : 400)),
        textAlign: (props.align ?? 'left') as 'left' | 'center' | 'right',
        color,
        // The editing surface occupies the same geometry as the printed text. Editor chrome
        // is intentionally transparent so the user never switches to a form-like editor.
        background: 'transparent',
        border: 'none',
        boxSizing: 'border-box',
        padding: `${ptToPx(V5_TEXT_PADDING_Y_PT, zoom)}px ${ptToPx(V5_TEXT_PADDING_X_PT, zoom)}px`,
        margin: 0,
        resize: 'none',
        overflow: 'hidden',
        outline: 'none',
        fontFamily: V5_FONT_FAMILY_CSS[props.fontFamily ?? 'sans'],
        fontStyle: props.italic ? 'italic' : 'normal',
        fontKerning: 'none',
        fontVariantLigatures: 'none',
        fontFeatureSettings: '"kern" 0, "liga" 0',
        textDecoration: props.underline ? 'underline' : 'none',
        lineHeight: 1.2,
        transform: geometry.rotation ? `rotate(${geometry.rotation / 100}deg)` : undefined,
        transformOrigin: 'center',
      }}
    />
  )
}

function TextFormattingStrip({
  node,
  bounds,
  viewport,
  onUpdate,
  onOpenInspector,
  more,
  colorPickerOpen,
  onColorPickerOpenChange,
  onColorPickerDragStart,
  onColorPickerDismissIntent,
}: {
  node: V5Node
  bounds: Bounds
  viewport?: DOMRect | null
  onUpdate: (patch: Partial<V5TextProps>) => void
  onOpenInspector: () => void
  more: MenuItem[]
  colorPickerOpen: boolean
  onColorPickerOpenChange: (open: boolean) => void
  onColorPickerDragStart: () => void
  onColorPickerDismissIntent: () => void
}) {
  const { ref, position } = useAnchoredToolbar(bounds, viewport, 40)
  const props = node.props as unknown as V5TextProps
  const weight = Number(props.fontWeight ?? (props.bold ? 700 : 400))
  const fontSize = Number(props.fontSize ?? 11)
  const fontLabel =
    props.fontFamily === 'serif' ? 'Times' : props.fontFamily === 'mono' ? 'Courier' : 'Arial'
  const commitFontSize = (input: HTMLInputElement) => {
    const parsed = Number(input.value.trim())
    const next = Number.isFinite(parsed) ? Math.min(72, Math.max(6, parsed)) : fontSize
    input.value = String(next)
    if (next !== fontSize) onUpdate({ fontSize: next })
  }
  const alignments = [
    { value: 'left' as const, label: 'Align left', Icon: AlignLeft },
    { value: 'center' as const, label: 'Align center', Icon: AlignCenter },
    { value: 'right' as const, label: 'Align right', Icon: AlignRight },
  ]
  const verticalAlignments = [
    { value: 'top' as const, label: 'Align text to top', Icon: AlignVerticalJustifyStart },
    { value: 'middle' as const, label: 'Align text to middle', Icon: AlignVerticalJustifyCenter },
    { value: 'bottom' as const, label: 'Align text to bottom', Icon: AlignVerticalJustifyEnd },
  ]
  return (
    <div
      ref={ref}
      data-v5-text-formatting
      data-v5-editor-chrome
      role="toolbar"
      aria-label="Text formatting"
      className="pointer-events-auto z-30 flex h-10 items-center gap-1 overflow-x-auto rounded-lg border border-border/80 bg-background/95 p-1 shadow-lg backdrop-blur"
      style={{
        position: 'fixed',
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? 'visible' : 'hidden',
        maxWidth: viewport ? Math.max(160, viewport.width - 16) : undefined,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Font family: ${fontLabel}`}
            className="flex h-7 w-24 shrink-0 items-center justify-between rounded-md border bg-background px-2 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{fontLabel}</span>
            <span aria-hidden>⌄</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-36">
          {V5_FONT_FAMILIES.map((family) => {
            const label = family === 'sans' ? 'Arial' : family === 'serif' ? 'Times' : 'Courier'
            return (
              <DropdownMenuItem key={family} onSelect={() => onUpdate({ fontFamily: family })}>
                <Check
                  className={`h-4 w-4 ${family === (props.fontFamily ?? 'sans') ? 'opacity-100' : 'opacity-0'}`}
                />
                {label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex h-7 shrink-0 items-center rounded-md border bg-background">
        <button
          type="button"
          aria-label="Decrease font size"
          className="grid h-full w-7 place-items-center rounded-l-md hover:bg-accent"
          onClick={() => onUpdate({ fontSize: Math.max(6, fontSize - 1) })}
        >
          −
        </button>
        <input
          key={`${node.id}:${fontSize}`}
          aria-label="Font size in points"
          className="h-full w-10 border-x bg-transparent text-center text-xs tabular-nums outline-none"
          type="text"
          inputMode="decimal"
          defaultValue={fontSize}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commitFontSize(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.currentTarget.value = String(fontSize)
              event.currentTarget.blur()
            }
          }}
        />
        <button
          type="button"
          aria-label="Increase font size"
          className="grid h-full w-7 place-items-center rounded-r-md hover:bg-accent"
          onClick={() => onUpdate({ fontSize: Math.min(72, fontSize + 1) })}
        >
          +
        </button>
      </div>
      <ColorPicker
        compact
        label="Text color"
        value={String(props.color ?? 'black')}
        open={colorPickerOpen}
        onOpenChange={onColorPickerOpenChange}
        onDragStart={onColorPickerDragStart}
        onDismissIntent={onColorPickerDismissIntent}
        onChange={(color) => onUpdate({ color: color as V5TextProps['color'] })}
      />
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={weight >= 600}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded ${weight >= 600 ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onUpdate({ fontWeight: weight >= 600 ? 400 : 700, bold: weight < 600 })}
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={Boolean(props.italic)}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded ${props.italic ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onUpdate({ italic: !props.italic })}
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Underline"
        aria-pressed={Boolean(props.underline)}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded ${props.underline ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onUpdate({ underline: !props.underline })}
      >
        <Underline className="h-4 w-4" />
      </button>
      {alignments.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={(props.align ?? 'left') === value}
          className={`grid h-7 w-7 place-items-center rounded ${(props.align ?? 'left') === value ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onUpdate({ align: value })}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
      {verticalAlignments.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={(props.verticalAlign ?? 'top') === value}
          className={`grid h-7 w-7 place-items-center rounded ${(props.verticalAlign ?? 'top') === value ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onUpdate({ verticalAlign: value })}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
      <button
        type="button"
        aria-label="More text properties"
        className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
        onPointerDown={(event) => event.preventDefault()}
        onClick={onOpenInspector}
      >
        <Settings2 className="h-4 w-4" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More actions"
            className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-accent"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <MenuItems items={more} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ShapeFormattingStrip({
  node,
  bounds,
  viewport,
  onUpdate,
  onOpenInspector,
  more,
  openPalette,
  onOpenPaletteChange,
  onColorPickerDragStart,
  onColorPickerDismissIntent,
}: {
  node: V5Node
  bounds: Bounds
  viewport?: DOMRect | null
  onUpdate: (patch: Partial<V5ShapeProps>) => void
  onOpenInspector: () => void
  more: MenuItem[]
  openPalette: 'fill' | 'stroke' | null
  onOpenPaletteChange: (palette: 'fill' | 'stroke' | null) => void
  onColorPickerDragStart: () => void
  onColorPickerDismissIntent: () => void
}) {
  const { ref, position } = useAnchoredToolbar(bounds, viewport, 40)
  const props = node.props as unknown as V5ShapeProps
  const isLine = props.variant === 'line'
  return (
    <div
      ref={ref}
      data-v5-editor-chrome
      role="toolbar"
      aria-label="Shape formatting"
      className="pointer-events-auto z-30 flex h-10 items-center gap-1 overflow-x-auto rounded-lg border border-border/80 bg-background/95 p-1 shadow-lg backdrop-blur"
      style={{
        position: 'fixed',
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? 'visible' : 'hidden',
        maxWidth: viewport ? Math.max(160, viewport.width - 16) : undefined,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {!isLine && (
        <ColorPicker
          compact
          label="Fill"
          value={String(props.fill ?? 'transparent')}
          open={openPalette === 'fill'}
          onOpenChange={(open) => onOpenPaletteChange(open ? 'fill' : null)}
          onDragStart={onColorPickerDragStart}
          onDismissIntent={onColorPickerDismissIntent}
          onChange={(fill) => onUpdate({ fill: fill as V5ShapeProps['fill'] })}
        />
      )}
      <ColorPicker
        compact
        label="Stroke"
        value={String(props.stroke === 'none' ? 'transparent' : (props.stroke ?? 'transparent'))}
        open={openPalette === 'stroke'}
        onOpenChange={(open) => onOpenPaletteChange(open ? 'stroke' : null)}
        onDragStart={onColorPickerDragStart}
        onDismissIntent={onColorPickerDismissIntent}
        onChange={(stroke) =>
          onUpdate({
            stroke: stroke === 'transparent' ? 'none' : (stroke as V5ShapeProps['stroke']),
          })
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Stroke style: ${props.strokeStyle ?? 'solid'}`}
            className="flex h-7 w-20 shrink-0 items-center justify-between rounded-md border bg-background px-2 text-xs capitalize outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{props.strokeStyle ?? 'solid'}</span>
            <span aria-hidden>⌄</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(['solid', 'dashed', 'dotted'] as const).map((style) => (
            <DropdownMenuItem
              key={style}
              className="capitalize"
              onSelect={() => onUpdate({ strokeStyle: style })}
            >
              <Check
                className={`h-4 w-4 ${style === (props.strokeStyle ?? 'solid') ? 'opacity-100' : 'opacity-0'}`}
              />
              {style}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarNumberStepper
        key={`stroke-${props.strokeWidth ?? 1}`}
        label="Stroke"
        ariaLabel="Stroke width in points"
        value={Number(props.strokeWidth ?? 1)}
        min={0.25}
        max={12}
        step={0.25}
        onCommit={(strokeWidth) => onUpdate({ strokeWidth })}
      />
      {props.variant === 'rect' && (
        <ToolbarNumberStepper
          key={`radius-${props.cornerRadius ?? 0}`}
          label="Radius"
          ariaLabel="Corner radius in points"
          value={Number(props.cornerRadius ?? 0)}
          min={0}
          max={200}
          step={1}
          onCommit={(cornerRadius) => onUpdate({ cornerRadius })}
        />
      )}
      <button
        type="button"
        aria-label="Open properties"
        className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-accent"
        onClick={onOpenInspector}
      >
        <Settings2 className="h-4 w-4" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More actions"
            className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-accent"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <MenuItems items={more} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ToolbarNumberStepper({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string
  ariaLabel: string
  value: number
  min: number
  max: number
  step: number
  onCommit: (value: number) => void
}) {
  const formatted = Number(value.toFixed(2)).toString()
  const [draft, setDraft] = useState(formatted)
  const commitValue = (candidate: number) => {
    const next = Math.min(max, Math.max(min, Number.isFinite(candidate) ? candidate : value))
    const rounded = Number(next.toFixed(2))
    setDraft(String(rounded))
    if (rounded !== value) onCommit(rounded)
  }
  return (
    <div
      className="flex h-7 shrink-0 items-center rounded-md border bg-background"
      aria-label={label}
    >
      <span className="px-1.5 text-[11px] text-muted-foreground">{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        className="grid h-full w-7 place-items-center border-l hover:bg-accent"
        onClick={() => commitValue(value - step)}
      >
        −
      </button>
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        type="text"
        className="h-full w-10 border-l bg-transparent text-center text-xs tabular-nums text-foreground outline-none"
        value={draft}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commitValue(Number(draft))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(formatted)
            event.currentTarget.blur()
          }
        }}
      />
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        className="grid h-full w-7 place-items-center rounded-r-md border-l hover:bg-accent"
        onClick={() => commitValue(value + step)}
      >
        +
      </button>
    </div>
  )
}

export function V5Canvas() {
  const session = useV5Session()
  const { libraryDrag, presetInsertRequest, clearPresetInsertRequest, setInspectorOpen } =
    useV5EditorUI()
  const hostRef = useRef<HTMLDivElement>(null)
  const pendingZoomRef = useRef<{
    anchor: ReturnType<typeof anchorAt>
    within: Point
    targetZoom: number
  } | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const snapActiveRef = useRef(false)
  const keyboardGuideTimerRef = useRef<number | null>(null)
  const keyboardGuideRemovalTimerRef = useRef<number | null>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [preview, setPreview] = useState<
    Record<string, { x: number; y: number; rotation?: number; width?: number; height?: number }>
  >({})
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [guidesFading, setGuidesFading] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [editingText, setEditingText] = useState<{
    id: string
    value: string
    initial: string
    initialGeometry: V5Geometry
    frame: V5Geometry
  } | null>(null)
  const [editingTableId, setEditingTableId] = useState<string | null>(null)
  const [activeTableCell, setActiveTableCell] = useState<TableCellPosition | null>(null)
  const [tableCellSelection, setTableCellSelection] = useState<TableCellSelection | null>(null)
  const [confirmTableAction, setConfirmTableAction] = useState<{
    message: string
    run: () => void
  } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const [badge, setBadge] = useState<string | null>(null)
  const [panMode, setPanMode] = useState(false)
  const selectionKey = session.selectedNodeIds.join('\u0000')
  useEffect(() => {
    if (keyboardGuideTimerRef.current !== null) window.clearTimeout(keyboardGuideTimerRef.current)
    if (keyboardGuideRemovalTimerRef.current !== null)
      window.clearTimeout(keyboardGuideRemovalTimerRef.current)
    keyboardGuideTimerRef.current = null
    keyboardGuideRemovalTimerRef.current = null
    setGuidesFading(false)
    setGuides([])
  }, [selectionKey, session.activePageId])
  useEffect(
    () => () => {
      if (keyboardGuideTimerRef.current !== null) window.clearTimeout(keyboardGuideTimerRef.current)
      if (keyboardGuideRemovalTimerRef.current !== null)
        window.clearTimeout(keyboardGuideRemovalTimerRef.current)
    },
    [],
  )
  const [openToolbarPalette, setOpenToolbarPalette] = useState<'text' | 'fill' | 'stroke' | null>(
    null,
  )
  const toolbarPaletteDragCloseRef = useRef(false)
  const setToolbarPalette = (palette: 'text' | 'fill' | 'stroke' | null) => {
    if (palette === null && toolbarPaletteDragCloseRef.current) {
      toolbarPaletteDragCloseRef.current = false
      return
    }
    setOpenToolbarPalette(palette)
  }
  const [feedback, setFeedback] = useState<{
    message: string
    tone: 'error' | 'info'
    clientX?: number
    clientY?: number
  } | null>(null)
  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 2600)
    return () => window.clearTimeout(timer)
  }, [feedback])
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const preventCanvasSelection = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-v5-text-editor], [data-v5-table-editor], [data-v5-content-edit]'))
        return
      event.preventDefault()
    }
    host.addEventListener('selectstart', preventCanvasSelection)
    return () => host.removeEventListener('selectstart', preventCanvasSelection)
  }, [])
  const clearNativeSelection = () => {
    const active = hostRef.current?.ownerDocument.activeElement as HTMLElement | null
    if (active?.closest('[data-v5-text-editor], [data-v5-table-editor], [data-v5-content-edit]'))
      return
    hostRef.current?.ownerDocument.defaultView?.getSelection()?.removeAllRanges()
  }
  const reportError = (error: unknown, fallback: string) =>
    setFeedback({
      message: error instanceof Error ? error.message : fallback,
      tone: 'error',
    })
  const zoom = session.zoom

  const document = session.document
  const pages = document.root.pages
  const pageStack = useMemo(
    () => layoutPageStack(pages, zoom, viewportSize),
    [pages, viewportSize, zoom],
  )
  const pageOffsets = pageStack.pages.map((page) => ({ x: page.left, y: page.top }))
  const contentSize = { width: pageStack.width, height: pageStack.height }

  const activePage = pages.find((page) => page.id === session.activePageId) ?? pages[0]

  const scopeChildren = useMemo(() => {
    if (!session.editScopeId) return activePage.children
    return (
      flattenNodes(activePage.children).find((node) => node.id === session.editScopeId)?.children ??
      []
    )
  }, [activePage, session.editScopeId])
  const allScopeNodes = useMemo(() => flattenNodes(scopeChildren), [scopeChildren])
  const visibleScopeNodes = scopeChildren.filter((node) => !isEffectivelyHidden(document, node.id))
  const interactiveIds = useMemo(
    () => new Set(visibleScopeNodes.map((node) => node.id)),
    [visibleScopeNodes],
  )
  const hiddenIds = useMemo(
    () =>
      new Set(
        pages
          .flatMap((page) => flattenNodes(page.children))
          .filter((node) => isEffectivelyHidden(document, node.id))
          .map((node) => node.id),
      ),
    [document, pages],
  )
  const selectedNodes = visibleScopeNodes.filter((node) =>
    session.selectedNodeIds.includes(node.id),
  )
  const primary = selectedNodes.at(-1) ?? null
  const scopeNode = session.editScopeId ? findNode(activePage.children, session.editScopeId) : null

  const nodeProjection = (node: V5Node) => {
    const chain = ancestorChain(document, node.id)
    const matrix = chain.reduce((current, item) => {
      const itemPreview = preview[item.id]
      const geometry = {
        ...item.geometry,
        x: itemPreview?.x ?? item.geometry.x,
        y: itemPreview?.y ?? item.geometry.y,
        width: itemPreview?.width ?? item.geometry.width,
        height: itemPreview?.height ?? item.geometry.height,
        rotation: itemPreview?.rotation ?? item.geometry.rotation,
      }
      return multiply(current, geometryMatrix(geometry))
    }, identity)
    const ownPreview = preview[node.id]
    const width = ownPreview?.width ?? node.geometry.width
    const height = ownPreview?.height ?? node.geometry.height
    const points = [
      apply(matrix, { x: 0, y: 0 }),
      apply(matrix, { x: width, y: 0 }),
      apply(matrix, { x: width, y: height }),
      apply(matrix, { x: 0, y: height }),
    ]
    const rotation = chain.reduce(
      (sum, item) => sum + (preview[item.id]?.rotation ?? item.geometry.rotation),
      0,
    )
    return {
      origin: geometryPositionFromMatrix(matrix, width, height, rotation),
      width,
      height,
      rotation,
      bounds: boundsForPoints(points),
      points,
    }
  }

  const marqueeRect: Bounds | null = marquee
    ? {
        x: Math.min(marquee.startDoc.x, marquee.currentDoc.x),
        y: Math.min(marquee.startDoc.y, marquee.currentDoc.y),
        width: Math.abs(marquee.currentDoc.x - marquee.startDoc.x),
        height: Math.abs(marquee.currentDoc.y - marquee.startDoc.y),
      }
    : null
  const marqueeCandidates =
    marquee?.activated && marqueeRect
      ? scopeChildren.filter(
          (node) =>
            !isEffectivelyHidden(document, node.id) &&
            !isEffectivelyLocked(document, node.id) &&
            polygonsOverlap(rectPolygon(marqueeRect), nodeProjection(node).points),
        )
      : []

  const docPointFromClient = (
    clientX: number,
    clientY: number,
    pageId = session.activePageId,
  ): Point => {
    const pageElement = hostRef.current?.querySelector(`[data-v5-page-id="${pageId}"]`)
    const rect = pageElement?.getBoundingClientRect()
    return {
      x: (clientX - (rect?.left ?? 0)) / zoom,
      y: (clientY - (rect?.top ?? 0)) / zoom,
    }
  }
  const clientPoint = (event: ReactPointerEvent): Point => ({ x: event.clientX, y: event.clientY })
  const pageDeltaToNodeAxes = (node: V5Node, delta: Point): Point => {
    const radians = (-nodeProjection(node).rotation / 100 / 180) * Math.PI
    return {
      x: delta.x * Math.cos(radians) - delta.y * Math.sin(radians),
      y: delta.x * Math.sin(radians) + delta.y * Math.cos(radians),
    }
  }
  const setZoomAt = (nextZoom: number, clientX?: number, clientY?: number) => {
    const host = hostRef.current
    if (!host) return session.setZoom(nextZoom)
    const rect = host.getBoundingClientRect()
    const x = clientX ?? rect.left + host.clientWidth / 2
    const y = clientY ?? rect.top + host.clientHeight / 2
    const clamped = Math.min(0.08, Math.max(0.001, nextZoom))
    const within = { x: x - rect.left, y: y - rect.top }
    const anchor =
      pendingZoomRef.current?.anchor ??
      anchorAt(pageStack, pages, zoom, {
        x: host.scrollLeft + within.x,
        y: host.scrollTop + within.y,
      })
    pendingZoomRef.current = { anchor, within, targetZoom: clamped }
    session.setZoom(clamped)
  }
  const centerDocumentPoint = (pageId: string, point: Point, atZoom: number) => {
    const host = hostRef.current
    if (!host) return
    const clamped = Math.min(0.08, Math.max(0.001, atZoom))
    pendingZoomRef.current = {
      anchor: { pageId, point },
      within: { x: host.clientWidth / 2, y: host.clientHeight / 2 },
      targetZoom: clamped,
    }
    session.setZoom(clamped)
  }

  // Apply the scroll only after React commits the scaled page stack. Rapid wheel events are
  // coalesced into one anchor correction, so stale animation frames cannot pull the page left.
  useLayoutEffect(() => {
    const host = hostRef.current
    const pending = pendingZoomRef.current
    if (!host || !pending || Math.abs(pending.targetZoom - zoom) > 0.0000001) return
    const target = pending.anchor && contentPointForAnchor(pageStack, pending.anchor, zoom)
    pendingZoomRef.current = null
    if (!target) return
    host.scrollTo({
      left: target.x - pending.within.x,
      top: target.y - pending.within.y,
    })
  }, [pageStack, zoom])
  const zoomByCommand = (nextZoom: number) => {
    if (primary) {
      const box = nodeProjection(primary).bounds
      centerDocumentPoint(
        session.activePageId,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        Math.min(0.08, Math.max(0.001, nextZoom)),
      )
    } else setZoomAt(nextZoom)
  }
  const fitView = (mode: 'page' | 'width' | 'selection') => {
    const host = hostRef.current
    if (!host) return
    const safeWidth = Math.max(120, host.clientWidth - 96)
    const safeHeight = Math.max(120, host.clientHeight - 112)
    const selection = mode === 'selection' ? unionSelectionBounds(selectedNodes) : null
    const target = selection ?? { x: 0, y: 0, width: activePage.width, height: activePage.height }
    const next = Math.min(
      0.08,
      Math.max(
        0.001,
        mode === 'width'
          ? safeWidth / target.width
          : Math.min(safeWidth / target.width, safeHeight / target.height),
      ),
    )
    centerDocumentPoint(
      session.activePageId,
      { x: target.x + target.width / 2, y: target.y + target.height / 2 },
      next,
    )
  }

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({
      kind: 'pan',
      startClient: clientPoint(event),
      startScroll: { x: host.scrollLeft, y: host.scrollTop },
    })
  }

  const snapCandidates = (pageId: string, movingIds: string[]): SnapRect[] => {
    const page = pages.find((candidate) => candidate.id === pageId)!
    const rects: SnapRect[] = [
      { id: '__page__', x: 0, y: 0, width: page.width, height: page.height },
      {
        id: '__margin__',
        x: page.margin.left,
        y: page.margin.top,
        width: page.width - page.margin.left - page.margin.right,
        height: page.height - page.margin.top - page.margin.bottom,
      },
    ]
    const moving = new Set(
      movingIds.flatMap((id) => {
        const node = findNode(page.children, id)
        return node ? flattenNodes([node]).map((item) => item.id) : [id]
      }),
    )
    const candidates = pageId === session.activePageId ? scopeChildren : page.children
    for (const node of candidates) {
      if (moving.has(node.id)) continue
      if (isEffectivelyHidden(document, node.id) || isEffectivelyLocked(document, node.id)) continue
      const box = nodeProjection(node).bounds
      rects.push({ id: node.id, ...box })
    }
    return rects
  }

  const handleTextAutoFrame = (nodeId: string, measured: { widthPx: number; heightPx: number }) => {
    const node = allScopeNodes.find((candidate) => candidate.id === nodeId)
    if (!node || node.layout_mode !== 'intrinsic' || editingText?.id !== nodeId) return
    const props = node.props as unknown as V5TextProps
    const height = fitIntrinsicTextHeight(measured.heightPx / zoom, Number(props.fontSize ?? 11))
    const width =
      (props.sizingMode ?? 'fixed-width') === 'auto-width'
        ? Math.max(200, du(measured.widthPx / zoom + V5_TEXT_INLINE_SAFETY_PT * 100))
        : editingText.frame.width
    if (
      Math.abs(height - editingText.frame.height) <= 1 &&
      Math.abs(width - editingText.frame.width) <= 1
    )
      return
    const next = resizeKeepingTopLeft(editingText.frame, width, height)
    setEditingText((current) => (current?.id === nodeId ? { ...current, frame: next } : current))
    setPreview((current) => ({ ...current, [nodeId]: next }))
  }

  const startTextEditing = (node: V5Node) => {
    if (node.kind !== 'text' || isEffectivelyLocked(document, node.id)) return
    setEditingTableId(null)
    setActiveTableCell(null)
    setTableCellSelection(null)
    setGesture(null)
    setPreview({})
    setGuidesFading(false)
    setGuides([])
    setEditingText({
      id: node.id,
      value: String(node.props?.text ?? ''),
      initial: String(node.props?.text ?? ''),
      initialGeometry: node.geometry,
      frame: node.geometry,
    })
    setHoverId(null)
  }

  const commitTextEditing = (revert = false) => {
    if (!editingText) return
    const { id, value, initial, initialGeometry, frame } = editingText
    setEditingText(null)
    setPreview((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (
      revert ||
      (value === initial &&
        frame.x === initialGeometry.x &&
        frame.y === initialGeometry.y &&
        frame.width === initialGeometry.width &&
        frame.height === initialGeometry.height)
    )
      return
    try {
      session.execute(updateTextContentAndGeometry(id, value, frame))
    } catch (error) {
      reportError(error, 'Text could not be updated.')
    }
  }

  const updateTextFormatting = (node: V5Node, patch: Partial<V5TextProps>) => {
    const props = {
      ...(node.props as unknown as V5TextProps),
      ...(editingText?.id === node.id ? { text: editingText.value } : {}),
      ...patch,
    }
    try {
      if (node.layout_mode === 'intrinsic' && hostRef.current) {
        const geometry = measureIntrinsicTextGeometry(
          node,
          props,
          editingText?.id === node.id ? editingText.frame : node.geometry,
          hostRef.current.ownerDocument,
        )
        session.execute(updateNodeGeometryAndProps(node.id, geometry, patch))
        if (editingText?.id === node.id) {
          setEditingText((current) =>
            current?.id === node.id ? { ...current, frame: geometry } : current,
          )
          setPreview((current) => ({ ...current, [node.id]: geometry }))
        }
      } else session.execute(updateNodeProps(node.id, patch))
    } catch (error) {
      reportError(error, 'Text formatting could not be updated.')
    }
  }

  const requestDelete = (ids: string[]) => {
    const deletable = ids.filter((id) => !isEffectivelyLocked(document, id))
    if (!deletable.length) return
    setConfirmDelete(deletable)
  }

  const performGroup = () => {
    const ids = session.selectedNodeIds
    if (ids.length < 2) return
    const groupId = session.nextID('group')
    try {
      session.execute(groupNodes(session.activePageId, ids, groupId))
      session.selectNode(groupId)
    } catch (error) {
      reportError(error, 'The selection cannot be grouped.')
    }
  }
  const performUngroup = () => {
    const node = primary
    if (!node || node.role !== 'group') return
    const children = node.children?.map((child) => child.id) ?? []
    try {
      session.execute(ungroupNode(node.id))
      session.selectNodes(children)
    } catch (error) {
      reportError(error, 'The group cannot be ungrouped.')
    }
  }
  const performDuplicate = () => {
    const ids = session.selectedNodeIds
    if (!ids.length) return
    const remembered = session.recallDuplicateTransform()
    const dx = remembered?.dx ?? du(1200)
    const dy = remembered?.dy ?? du(1200)
    const cloneIds = ids.map(() => session.nextID('node'))
    let index = 0
    try {
      session.execute(duplicateAndMove(ids, dx, dy, () => cloneIds[index++]))
      if (remembered) session.rememberDuplicateTransform(dx, dy)
      session.selectNodes(cloneIds)
    } catch (error) {
      reportError(error, 'The selection cannot be duplicated.')
    }
  }
  const performAlign = (mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => {
    try {
      session.execute(alignNodes(session.selectedNodeIds, mode))
    } catch (error) {
      reportError(error, 'The selection cannot be aligned.')
    }
  }
  const alignSingle = (mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => {
    if (!primary) return
    try {
      session.execute(alignToPage(primary.id, mode))
    } catch (error) {
      reportError(error, 'The object cannot be aligned.')
    }
  }

  // --- placement tools (text/shape/image/table) — Figma/Excalidraw-style click or drag -----

  const placeRect = (gesture: Extract<Gesture, { kind: 'place' }>): Bounds => {
    const width = Math.abs(gesture.currentDoc.x - gesture.startDoc.x)
    const height = Math.abs(gesture.currentDoc.y - gesture.startDoc.y)
    const x = Math.min(gesture.startDoc.x, gesture.currentDoc.x)
    const y = Math.min(gesture.startDoc.y, gesture.currentDoc.y)
    return { x, y, width, height }
  }

  /** Ghost shows the dragged rect, or the tool default at the click point before threshold. */
  const placeGhostRect = (gesture: Extract<Gesture, { kind: 'place' }>): CSSProperties => {
    const dragged = placeRect(gesture)
    const active =
      dragged.width * zoom > MOVE_THRESHOLD_PX || dragged.height * zoom > MOVE_THRESHOLD_PX
    const rect = active ? dragged : defaultToolRect(session.tool, gesture.startDoc)
    return {
      left: rect.x * zoom,
      top: rect.y * zoom,
      width: rect.width * zoom,
      height: rect.height * zoom,
    }
  }

  const commitPlace = (
    gesture: Extract<Gesture, { kind: 'place' }>,
    placement?: { tool: V5Tool; variant?: V5ShapeProps['variant'] },
  ) => {
    const tool = placement?.tool ?? session.tool
    const variant = placement?.variant ?? session.shapeVariant
    const page = pages.find((candidate) => candidate.id === gesture.pageId)
    if (!page) return
    const dragged = placeRect(gesture)
    const threshold = MOVE_THRESHOLD_PX / zoom
    const isDrag =
      dragged.width * zoom > MOVE_THRESHOLD_PX || dragged.height * zoom > MOVE_THRESHOLD_PX
    let rect: Bounds = isDrag
      ? variant === 'square'
        ? {
            x:
              gesture.currentDoc.x >= gesture.startDoc.x
                ? gesture.startDoc.x
                : gesture.startDoc.x - Math.max(dragged.width, dragged.height),
            y:
              gesture.currentDoc.y >= gesture.startDoc.y
                ? gesture.startDoc.y
                : gesture.startDoc.y - Math.max(dragged.width, dragged.height),
            width: Math.max(dragged.width, dragged.height, 400),
            height: Math.max(dragged.width, dragged.height, 400),
          }
        : { ...dragged, width: Math.max(dragged.width, 400), height: Math.max(dragged.height, 400) }
      : defaultToolRect(tool, gesture.startDoc)
    if (!isDrag) {
      const placed = findPlacement(
        page,
        { width: rect.width, height: rect.height },
        { x: rect.x, y: rect.y },
        page.children
          .filter((node) => !isEffectivelyHidden(document, node.id))
          .map((node) => boundsForPoints(corners(node.geometry))),
      )
      if (!placed) {
        setFeedback({ message: 'There is no printable space for this item.', tone: 'error' })
        return
      }
      rect = { ...rect, x: placed.x, y: placed.y }
      if (placed.fallback) setBadge('Placed in the nearest printable space')
    }
    const geometry = {
      x: du(Math.max(0, Math.min(rect.x, page.width - rect.width))),
      y: du(Math.max(0, Math.min(rect.y, page.height - rect.height))),
      width: du(Math.min(rect.width, page.width)),
      height: du(tool === 'shape' && variant === 'line' ? 200 : Math.min(rect.height, page.height)),
      rotation: 0,
    }
    let nodeId = session.nextID('node')
    if (tool === 'text') {
      session.execute(
        insertNode(page.id, {
          id: nodeId,
          kind: 'text',
          role: 'element',
          name: 'Text',
          geometry,
          layout_mode: 'intrinsic',
          locked: false,
          visibility: 'shown',
          optional: false,
          props: {
            ...defaultTextProps(),
            text: 'Text',
            sizingMode: isDrag ? 'fixed-width' : 'auto-width',
          },
        }),
      )
      session.selectNode(nodeId)
      session.setTool('select')
      setPreview({})
      setEditingText({
        id: nodeId,
        value: 'Text',
        initial: 'Text',
        initialGeometry: geometry,
        frame: geometry,
      })
      return
    }
    if (tool === 'shape') {
      session.execute(
        insertNode(page.id, {
          id: nodeId,
          kind: 'shape',
          role: 'element',
          name: variant === 'line' ? 'Line' : variant.charAt(0).toUpperCase() + variant.slice(1),
          geometry,
          layout_mode: 'fixed',
          locked: false,
          visibility: 'shown',
          optional: false,
          props:
            variant === 'line'
              ? { ...defaultShapeProps({ variant: 'line', fill: 'none', stroke: 'black' }) }
              : variant === 'rect' || variant === 'square'
                ? { ...defaultShapeProps({ variant: 'rect', fill: 'primary' }) }
                : { ...defaultShapeProps({ variant: 'ellipse', fill: 'primary' }) },
        }),
      )
    } else if (tool === 'image') {
      session.execute(
        insertNode(page.id, {
          id: nodeId,
          kind: 'image',
          role: 'element',
          name: 'Image',
          geometry,
          layout_mode: 'fixed',
          locked: false,
          visibility: 'shown',
          optional: false,
          props: { source: '' },
        }),
      )
    } else if (tool === 'table') {
      const storyId = session.nextID('story')
      const table = createBlankTable(2, 2, geometry.width)
      geometry.height = tableHeightDU(table)
      session.execute(
        insertStoryFrame(
          page.id,
          {
            id: nodeId,
            kind: 'flow-frame',
            role: 'flow-frame',
            name: 'Table',
            story_id: storyId,
            continuation: 'auto-pages',
            geometry,
            layout_mode: 'flow-frame',
            locked: false,
            visibility: 'shown',
            optional: false,
          },
          createStory(storyId, 'table', table),
        ),
      )
    } else {
      return
    }
    session.selectNode(nodeId)
    session.setTool('select')
    void threshold
  }

  /** Inserts a controlled palette preset at the drop point. The same node schema feeds preview
   * and Go PDF rendering; drag/drop is never a separate DOM-only representation. */
  const insertPresetAt = (
    preset: V5ToolPreset,
    pageId: string,
    at: Point,
    propsOverride?: Record<string, unknown>,
    tableSize?: { rows: number; columns: number },
    avoidOverlap = false,
  ): string | null => {
    const page = pages.find((candidate) => candidate.id === pageId)
    if (!page) return null
    const sourceWidth = Number(propsOverride?.intrinsicWidth)
    const sourceHeight = Number(propsOverride?.intrinsicHeight)
    const insertSize =
      preset.kind === 'image' && sourceWidth > 0 && sourceHeight > 0
        ? fitImageSize(sourceWidth, sourceHeight, preset.size.width, preset.size.height)
        : preset.size
    const preferred = {
      x: at.x - insertSize.width / 2,
      y: at.y - insertSize.height / 2,
    }
    const placement = avoidOverlap
      ? findPlacement(
          page,
          insertSize,
          preferred,
          page.children
            .filter((node) => !isEffectivelyHidden(document, node.id))
            .map((node) => boundsForPoints(corners(node.geometry))),
        )
      : null
    if (avoidOverlap && !placement) {
      setFeedback({ message: 'There is no printable space for this item.', tone: 'error' })
      return null
    }
    const geometry = {
      x: du(placement?.x ?? Math.max(0, Math.min(preferred.x, page.width - insertSize.width))),
      y: du(placement?.y ?? Math.max(0, Math.min(preferred.y, page.height - insertSize.height))),
      width: insertSize.width,
      height: insertSize.height,
      rotation: 0,
    }
    const nodeId = session.nextID('node')
    try {
      if (preset.role === 'flow-frame') {
        const storyId = session.nextID('story')
        const columns = tableSize?.columns ?? 2
        geometry.width = Math.min(
          page.width,
          Math.max(geometry.width, du(columns * TABLE_MIN_COLUMN_WIDTH_MM * DU_PER_MM)),
        )
        geometry.x = du(Math.max(0, Math.min(geometry.x, page.width - geometry.width)))
        const table = createBlankTable(tableSize?.rows ?? 2, columns, geometry.width)
        geometry.height = tableHeightDU(table)
        session.execute(
          insertStoryFrame(
            pageId,
            {
              id: nodeId,
              kind: 'flow-frame',
              role: 'flow-frame',
              name: preset.label,
              story_id: storyId,
              continuation: 'auto-pages',
              geometry,
              layout_mode: 'flow-frame',
              locked: false,
              visibility: 'shown',
              optional: false,
            },
            createStory(storyId, 'table', table),
          ),
        )
      } else {
        session.execute(
          insertNode(pageId, {
            id: nodeId,
            kind: preset.kind,
            role: preset.role,
            name: preset.label,
            geometry,
            layout_mode: preset.layoutMode,
            locked: false,
            visibility: 'shown',
            optional: false,
            props: { ...preset.props, ...propsOverride },
          }),
        )
      }
      session.selectNode(nodeId)
      if (preset.kind === 'text') {
        const value = String(propsOverride?.text ?? preset.props?.text ?? '')
        setPreview({})
        setEditingText({
          id: nodeId,
          value,
          initial: value,
          initialGeometry: geometry,
          frame: geometry,
        })
      }
      if (placement?.fallback) setBadge('Placed in the nearest printable space')
      return nodeId
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'This item cannot be inserted here.',
        tone: 'error',
      })
      return null
    }
  }

  useEffect(() => {
    if (!presetInsertRequest) return
    const preset = V5_TOOL_PRESETS.find(
      (candidate) => candidate.id === presetInsertRequest.presetId,
    )
    if (!preset) {
      clearPresetInsertRequest()
      return
    }
    let pageId = session.activePageId
    let point: Point
    if (
      presetInsertRequest.mode === 'drop' &&
      presetInsertRequest.clientX !== undefined &&
      presetInsertRequest.clientY !== undefined
    ) {
      const owner = hostRef.current?.ownerDocument
      const target = owner?.elementFromPoint(
        presetInsertRequest.clientX,
        presetInsertRequest.clientY,
      ) as HTMLElement | null
      const page = target?.closest?.('[data-v5-page-id]') as HTMLElement | null
      pageId = page?.getAttribute('data-v5-page-id') ?? ''
      if (!pageId) {
        setFeedback({
          message: 'Drop the item on an authored page.',
          tone: 'error',
          clientX: presetInsertRequest.clientX,
          clientY: presetInsertRequest.clientY,
        })
        clearPresetInsertRequest()
        return
      }
      point = docPointFromClient(presetInsertRequest.clientX, presetInsertRequest.clientY, pageId)
    } else {
      const pageElement = hostRef.current?.querySelector(
        `[data-v5-page-id="${pageId}"]`,
      ) as HTMLElement | null
      const hostRect = hostRef.current?.getBoundingClientRect()
      const pageRect = pageElement?.getBoundingClientRect()
      const clientX =
        pageRect && hostRect
          ? Math.max(pageRect.left, hostRect.left) +
            Math.max(
              0,
              Math.min(pageRect.right, hostRect.right) - Math.max(pageRect.left, hostRect.left),
            ) /
              2
          : (pageRect?.left ?? 0)
      const clientY =
        pageRect && hostRect
          ? Math.max(pageRect.top, hostRect.top + 52) +
            Math.max(
              0,
              Math.min(pageRect.bottom, hostRect.bottom) -
                Math.max(pageRect.top, hostRect.top + 52),
            ) /
              2
          : (pageRect?.top ?? 0)
      point = docPointFromClient(clientX, clientY, pageId)
    }
    if (pageId !== session.activePageId) session.setActivePage(pageId)
    if (
      insertPresetAt(
        preset,
        pageId,
        point,
        undefined,
        {
          rows: presetInsertRequest.tableRows ?? 2,
          columns: presetInsertRequest.tableColumns ?? 2,
        },
        presetInsertRequest.mode !== 'drop',
      )
    )
      session.setTool('select')
    clearPresetInsertRequest()
    // The request token is the event boundary; document/session changes are intentionally not
    // dependencies or one insert could replay after its own command commits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetInsertRequest?.token])

  const defaultToolRect = (tool: V5Tool, at: Point): Bounds => {
    const defaults: Record<V5Tool, { width: number; height: number }> = {
      select: { width: 4000, height: 3000 },
      hand: { width: 4000, height: 3000 },
      text: { width: 22000, height: 1600 },
      shape: { width: 12000, height: 9000 },
      image: { width: 12000, height: 12000 },
      table: { width: 32000, height: 16000 },
    }
    const size = defaults[tool]
    return {
      x: at.x - size.width / 2,
      y: at.y - size.height / 2,
      width: size.width,
      height: size.height,
    }
  }
  const performDistribute = (axis: 'x' | 'y') => {
    try {
      session.execute(distributeNodes(session.selectedNodeIds, axis))
    } catch (error) {
      reportError(error, 'The selection cannot be distributed.')
    }
  }

  const beginMove = (node: V5Node, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    if (keyboardGuideTimerRef.current !== null) window.clearTimeout(keyboardGuideTimerRef.current)
    if (keyboardGuideRemovalTimerRef.current !== null)
      window.clearTimeout(keyboardGuideRemovalTimerRef.current)
    setGuidesFading(false)
    setGuides([])
    if (editingText && editingText.id !== node.id) commitTextEditing(false)
    if (editingTableId && editingTableId !== node.id) {
      setEditingTableId(null)
      setActiveTableCell(null)
      setTableCellSelection(null)
    }
    const additive = event.shiftKey
    const cycling = event.metaKey || event.ctrlKey
    if (isEffectivelyLocked(document, node.id)) {
      // A locked object can still be selected and inspected. It never starts a move gesture;
      // the selection overlay replaces rotation with a lock badge so the restriction is clear
      // without emitting an error on every drag attempt.
      session.selectNode(node.id, additive)
      return
    }
    if (cycling) {
      const stack =
        hostRef.current?.ownerDocument.elementsFromPoint(event.clientX, event.clientY) ?? []
      const under = uniqueNodeIdsFromElements(stack as HTMLElement[])
      if (under.length > 1) {
        const currentIndex = under.indexOf(session.selectedNodeId ?? '')
        const next = under[(currentIndex + 1) % under.length]
        session.selectNode(next)
        return
      }
    }
    const alreadySelected = session.selectedNodeIds.includes(node.id)
    const toggleOnClick = additive && alreadySelected
    // Pressing an already-selected member must preserve the whole multi-selection so the
    // pointer can move its union. Shift-click still toggles that member on pointer-up when no
    // drag threshold was crossed.
    if (!alreadySelected) session.selectNode(node.id, additive)
    const candidateIds = additive
      ? alreadySelected
        ? session.selectedNodeIds
        : [...session.selectedNodeIds, node.id]
      : alreadySelected
        ? session.selectedNodeIds
        : [node.id]
    // Locked members remain selected for inspection but are silently excluded from direct
    // manipulation. Their lock badge already explains why they stay in place.
    const ids = candidateIds.filter((id) => !isEffectivelyLocked(document, id))
    if (!ids.length) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({
      kind: 'move',
      ids,
      ownerId: node.id,
      pageId: session.activePageId,
      // Deltas are computed from client pixels converted by zoom; storing the doc point here
      // would mix units and fling objects to the page origin.
      startClient: clientPoint(event),
      startScroll: {
        x: hostRef.current?.scrollLeft ?? 0,
        y: hostRef.current?.scrollTop ?? 0,
      },
      base: new Map(
        ids.map((id) => {
          const target = allScopeNodes.find((candidate) => candidate.id === id)!
          return [id, { x: target.geometry.x, y: target.geometry.y }]
        }),
      ),
      worldBounds: new Map(
        ids.map((id) => {
          const target = allScopeNodes.find((candidate) => candidate.id === id)!
          return [id, nodeProjection(target).bounds]
        }),
      ),
      duplicate: event.altKey,
      toggleOnClick,
      activated: false,
    })
  }

  const uniqueNodeIdsFromElements = (elements: HTMLElement[]): string[] => {
    const ids: string[] = []
    for (const element of elements) {
      const id = element.getAttribute?.('data-v5-node-id')
      if (id && !ids.includes(id)) ids.push(id)
    }
    const scopeIds = new Set(scopeChildren.map((node) => node.id))
    return ids.filter(
      (id) =>
        scopeIds.has(id) &&
        !isEffectivelyHidden(document, id) &&
        !isEffectivelyLocked(document, id),
    )
  }

  const beginResize = (handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (keyboardGuideTimerRef.current !== null) window.clearTimeout(keyboardGuideTimerRef.current)
    if (keyboardGuideRemovalTimerRef.current !== null)
      window.clearTimeout(keyboardGuideRemovalTimerRef.current)
    setGuidesFading(false)
    setGuides([])
    const node = primary
    if (!node || !resizeHandlesFor(node).includes(handle)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({
      kind: 'resize',
      id: node.id,
      handle,
      startClient: clientPoint(event),
      startScroll: { x: hostRef.current?.scrollLeft ?? 0, y: hostRef.current?.scrollTop ?? 0 },
      geometry: node.geometry,
    })
  }
  const beginRotate = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (keyboardGuideTimerRef.current !== null) window.clearTimeout(keyboardGuideTimerRef.current)
    if (keyboardGuideRemovalTimerRef.current !== null)
      window.clearTimeout(keyboardGuideRemovalTimerRef.current)
    setGuidesFading(false)
    setGuides([])
    const node = primary
    if (!node) return
    if (isEffectivelyLocked(document, node.id)) return
    if (node.role === 'flow-frame') return
    if (node.role === 'element' && !canRotate(node)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({ kind: 'rotate', id: node.id, geometry: node.geometry })
  }

  const rotationAtPointer = (node: V5Node, point: Point, snap: boolean): number => {
    const pageElement = hostRef.current?.querySelector(
      `[data-v5-page-id="${session.activePageId}"]`,
    )
    const pageRect = pageElement?.getBoundingClientRect()
    const projection = nodeProjection(node)
    const centerInPage = {
      x: projection.points.reduce((sum, item) => sum + item.x, 0) / 4,
      y: projection.points.reduce((sum, item) => sum + item.y, 0) / 4,
    }
    const center = pageRect
      ? {
          x: pageRect.left + centerInPage.x * zoom,
          y: pageRect.top + centerInPage.y * zoom,
        }
      : point
    const degrees = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90
    const worldRotation = snap ? Math.round(degrees / 15) * 15 : degrees
    const parentRotation = projection.rotation - node.geometry.rotation
    return worldRotation * 100 - parentRotation
  }

  const canRotate = (node: V5Node): boolean => {
    if (isEffectivelyLocked(document, node.id)) return false
    if (node.role === 'flow-frame') return false
    if (node.role === 'group')
      return flattenNodes([node]).every((child) => child.role === 'group' || canRotate(child))
    return getV5Widget(node.kind)?.canRotate ?? false
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = clientPoint(event)
    if (gesture?.kind === 'pan') {
      hostRef.current?.scrollTo({
        left: gesture.startScroll.x - (point.x - gesture.startClient.x),
        top: gesture.startScroll.y - (point.y - gesture.startClient.y),
      })
      return
    }
    if (marquee || gesture?.kind === 'move' || gesture?.kind === 'resize') {
      const host = hostRef.current
      if (host) {
        const rect = host.getBoundingClientRect()
        const edge = 28
        const speed = 14
        const panX = point.x < rect.left + edge ? -speed : point.x > rect.right - edge ? speed : 0
        const panY = point.y < rect.top + edge ? -speed : point.y > rect.bottom - edge ? speed : 0
        if (panX || panY) host.scrollBy({ left: panX, top: panY })
      }
    }
    if (marquee) {
      const currentDoc = docPointFromClient(point.x, point.y, marquee.pageId)
      const crossedThreshold =
        Math.abs(currentDoc.x - marquee.startDoc.x) * zoom > MOVE_THRESHOLD_PX ||
        Math.abs(currentDoc.y - marquee.startDoc.y) * zoom > MOVE_THRESHOLD_PX
      const activated = marquee.activated || crossedThreshold
      if (activated && !marquee.activated) {
        clearNativeSelection()
        try {
          hostRef.current?.setPointerCapture(event.pointerId)
        } catch {
          /* capture can fail only if the browser already cancelled the pointer */
        }
      }
      setMarquee({ ...marquee, currentDoc, activated })
      return
    }
    if (!gesture) {
      // Hover identification follows the topmost element under the pointer.
      const target = event.target as HTMLElement
      const id = target.closest?.('[data-v5-node-id]')?.getAttribute('data-v5-node-id') ?? null
      setHoverId(id && interactiveIds.has(id) && id !== session.selectedNodeId ? id : null)
      return
    }
    if (gesture.kind === 'place') {
      // Placement tools drag a ghost rect in document space.
      setGesture({ ...gesture, currentDoc: docPointFromClient(point.x, point.y, gesture.pageId) })
      return
    }
    // Pointer deltas: client pixels → document units. startClient keeps the units consistent.
    const scrollDelta =
      gesture.kind === 'move' || gesture.kind === 'resize'
        ? {
            x: (hostRef.current?.scrollLeft ?? gesture.startScroll.x) - gesture.startScroll.x,
            y: (hostRef.current?.scrollTop ?? gesture.startScroll.y) - gesture.startScroll.y,
          }
        : { x: 0, y: 0 }
    const dx =
      gesture.kind === 'move' || gesture.kind === 'resize'
        ? (point.x - gesture.startClient.x + scrollDelta.x) / zoom
        : 0
    const dy =
      gesture.kind === 'move' || gesture.kind === 'resize'
        ? (point.y - gesture.startClient.y + scrollDelta.y) / zoom
        : 0
    if (gesture.kind === 'move') {
      const crossedThreshold =
        Math.abs(point.x - gesture.startClient.x) > MOVE_THRESHOLD_PX ||
        Math.abs(point.y - gesture.startClient.y) > MOVE_THRESHOLD_PX
      if (!gesture.activated && !crossedThreshold) return
      const moveGesture = gesture.activated ? gesture : { ...gesture, activated: true }
      if (!gesture.activated) {
        clearNativeSelection()
        // Keep direct manipulation quiet until the user actually drags. This prevents a
        // click from flashing a drag state or hiding the contextual toolbar.
        setGesture(moveGesture)
      }
      let translateX = dx
      let translateY = dy
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) translateY = 0
        else translateX = 0
      }
      // Clamp the whole union inside the page; margins warn but are not hard bounds.
      const page = pages.find((candidate) => candidate.id === moveGesture.pageId)!
      const union = unionOfBase(moveGesture)
      translateX = Math.min(Math.max(translateX, -union.x), page.width - union.x - union.width)
      translateY = Math.min(Math.max(translateY, -union.y), page.height - union.y - union.height)
      const movingRect: SnapRect = {
        id: '__moving__',
        x: union.x + translateX,
        y: union.y + translateY,
        width: union.width,
        height: union.height,
      }
      const threshold = (snapActiveRef.current ? SNAP_SCREEN_PX + 2 : SNAP_SCREEN_PX) / zoom
      const snap = event.ctrlKey
        ? { dx: 0, dy: 0, guides: [] }
        : snapRect(movingRect, snapCandidates(moveGesture.pageId, moveGesture.ids), threshold)
      setGuidesFading(false)
      setGuides(snap.guides)
      snapActiveRef.current = snap.guides.length > 0
      setPreview(
        Object.fromEntries(
          moveGesture.ids.map((id) => {
            const base = moveGesture.base.get(id)!
            const localDelta = pageDeltaToParent(document, id, {
              x: translateX + (snap.xGuide !== undefined ? snap.dx : 0),
              y: translateY + (snap.yGuide !== undefined ? snap.dy : 0),
            })
            return [
              id,
              {
                x: base.x + localDelta.x,
                y: base.y + localDelta.y,
              },
            ]
          }),
        ),
      )
      setBadge(
        `${Math.round(translateX + snap.dx) / 100}pt, ${Math.round(translateY + snap.dy) / 100}pt`,
      )
      return
    }
    if (gesture.kind === 'resize') {
      const node = allScopeNodes.find((candidate) => candidate.id === gesture.id)
      if (!node) return
      const localDelta = pageDeltaToNodeAxes(node, { x: dx, y: dy })
      const preserveAspect =
        getV5Widget(node.kind)?.aspectPolicy === 'preserve-by-default'
          ? !event.shiftKey
          : event.shiftKey
      const nextGeometry = resizeGeometry(
        gesture.geometry,
        gesture.handle,
        localDelta.x,
        localDelta.y,
        {
          fromCenter: event.altKey,
          preserveAspect,
          minSize: 200,
        },
      )
      const page = pages.find((candidate) => candidate.id === session.activePageId)!
      const edges = {
        left: gesture.handle.includes('w'),
        right: gesture.handle.includes('e'),
        top: gesture.handle.includes('n'),
        bottom: gesture.handle.includes('s'),
      }
      const threshold = (snapActiveRef.current ? SNAP_SCREEN_PX + 2 : SNAP_SCREEN_PX) / zoom
      const canAxisSnap =
        nodeProjection(node).rotation % 36000 === 0 && ancestorChain(document, node.id).length === 1
      const snap =
        event.ctrlKey || !canAxisSnap
          ? null
          : snapResize(
              { id: node.id, ...nextGeometry },
              edges,
              snapCandidates(session.activePageId, [node.id]),
              threshold,
            )
      let finalGeometry = snap ? snap.rect : nextGeometry
      if (
        node.kind === 'text' &&
        node.layout_mode === 'intrinsic' &&
        (gesture.handle === 'w' || gesture.handle === 'e') &&
        hostRef.current
      )
        finalGeometry = measureIntrinsicTextGeometry(
          node,
          { ...(node.props as unknown as V5TextProps), sizingMode: 'fixed-width' },
          finalGeometry as V5Geometry,
          hostRef.current.ownerDocument,
        )
      setGuidesFading(false)
      setGuides(snap?.guides ?? [])
      snapActiveRef.current = Boolean(snap?.guides.length)
      setPreview({
        [node.id]: {
          x: finalGeometry.x,
          y: finalGeometry.y,
          width: finalGeometry.width,
          height: finalGeometry.height,
        },
      })
      setBadge(
        `${Math.round(finalGeometry.width) / 100} × ${Math.round(finalGeometry.height) / 100} pt`,
      )
      void page
      return
    }
    if (gesture.kind === 'rotate') {
      const node = allScopeNodes.find((candidate) => candidate.id === gesture.id)
      if (!node) return
      const rotation = rotationAtPointer(node, point, event.shiftKey)
      setPreview({
        [node.id]: {
          x: node.geometry.x,
          y: node.geometry.y,
          rotation,
        },
      })
      const parentRotation = nodeProjection(node).rotation - node.geometry.rotation
      setBadge(`${Math.round((rotation + parentRotation) / 100)}°`)
    }
  }

  const unionOfBase = (gesture: Extract<Gesture, { kind: 'move' }>): Bounds => {
    const xs: number[] = []
    const ys: number[] = []
    for (const box of gesture.worldBounds.values()) {
      xs.push(box.x, box.x + box.width)
      ys.push(box.y, box.y + box.height)
    }
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }
  }

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = clientPoint(event)
    if (marquee) {
      const rectInPage: Bounds = {
        x: Math.min(marquee.startDoc.x, marquee.currentDoc.x),
        y: Math.min(marquee.startDoc.y, marquee.currentDoc.y),
        width: Math.abs(marquee.currentDoc.x - marquee.startDoc.x),
        height: Math.abs(marquee.currentDoc.y - marquee.startDoc.y),
      }
      const thresholdReached =
        rectInPage.width * zoom > MOVE_THRESHOLD_PX || rectInPage.height * zoom > MOVE_THRESHOLD_PX
      if (!thresholdReached) {
        // Sub-threshold drag is an empty click: clear selection.
        session.selectNode(null)
      } else {
        // Commit exactly the positive-overlap candidates shown by the live marquee preview.
        const ids = marqueeCandidates.map((node) => node.id)
        session.selectNodes(marquee.additive ? [...new Set([...marquee.base, ...ids])] : ids)
      }
      setMarquee(null)
      return
    }
    if (!gesture) return
    if (gesture.kind === 'pan') {
      setGesture(null)
      return
    }
    if (gesture.kind === 'place') {
      commitPlace(gesture)
      setGesture(null)
      return
    }
    // Pointer deltas: client pixels → document units. startClient keeps the units consistent.
    const scrollDelta =
      gesture.kind === 'move' || gesture.kind === 'resize'
        ? {
            x: (hostRef.current?.scrollLeft ?? gesture.startScroll.x) - gesture.startScroll.x,
            y: (hostRef.current?.scrollTop ?? gesture.startScroll.y) - gesture.startScroll.y,
          }
        : { x: 0, y: 0 }
    const dx =
      gesture.kind === 'move' || gesture.kind === 'resize'
        ? (point.x - gesture.startClient.x + scrollDelta.x) / zoom
        : 0
    const dy =
      gesture.kind === 'move' || gesture.kind === 'resize'
        ? (point.y - gesture.startClient.y + scrollDelta.y) / zoom
        : 0
    try {
      if (gesture.kind === 'move') {
        if (!gesture.activated && gesture.toggleOnClick) {
          session.selectNode(gesture.ownerId, true)
        }
        const previewDx = preview[gesture.ids[0]]
          ? preview[gesture.ids[0]].x - gesture.base.get(gesture.ids[0])!.x
          : dx
        const previewDy = preview[gesture.ids[0]]
          ? preview[gesture.ids[0]].y - gesture.base.get(gesture.ids[0])!.y
          : dy
        if (gesture.activated && gesture.duplicate) {
          const cloneIds = gesture.ids.map(() => session.nextID('node'))
          let index = 0
          session.execute(
            duplicateAndMove(gesture.ids, previewDx, previewDy, () => cloneIds[index++]),
          )
          session.rememberDuplicateTransform(previewDx, previewDy)
          session.selectNodes(cloneIds)
        } else if (
          gesture.activated &&
          (Math.round(previewDx) !== 0 || Math.round(previewDy) !== 0)
        ) {
          session.execute(moveNodes(gesture.ids, previewDx, previewDy))
        }
      } else if (gesture.kind === 'resize') {
        // Recompute the final geometry exactly as the preview did so commit is jump-free.
        const node = allScopeNodes.find((candidate) => candidate.id === gesture.id)
        if (!node) throw new Error('The resized object is no longer available.')
        const localDelta = pageDeltaToNodeAxes(node, { x: dx, y: dy })
        const preserveAspect =
          getV5Widget(node.kind)?.aspectPolicy === 'preserve-by-default'
            ? !event.shiftKey
            : event.shiftKey
        const nextGeometry = resizeGeometry(
          gesture.geometry,
          gesture.handle,
          localDelta.x,
          localDelta.y,
          {
            fromCenter: event.altKey,
            preserveAspect,
            minSize: 200,
          },
        )
        const edges = {
          left: gesture.handle.includes('w'),
          right: gesture.handle.includes('e'),
          top: gesture.handle.includes('n'),
          bottom: gesture.handle.includes('s'),
        }
        const canAxisSnap =
          nodeProjection(node).rotation % 36000 === 0 &&
          ancestorChain(document, node.id).length === 1
        const snap =
          event.ctrlKey || !canAxisSnap
            ? null
            : snapResize(
                { id: node.id, ...nextGeometry },
                edges,
                snapCandidates(session.activePageId, [node.id]),
                (snapActiveRef.current ? SNAP_SCREEN_PX + 2 : SNAP_SCREEN_PX) / zoom,
              )
        let finalGeometry = snap ? snap.rect : nextGeometry
        if (
          node.kind === 'text' &&
          node.layout_mode === 'intrinsic' &&
          (gesture.handle === 'w' || gesture.handle === 'e') &&
          hostRef.current
        )
          finalGeometry = measureIntrinsicTextGeometry(
            node,
            { ...(node.props as unknown as V5TextProps), sizingMode: 'fixed-width' },
            finalGeometry as V5Geometry,
            hostRef.current.ownerDocument,
          )
        // Persist the exact preview rectangle. Replaying edge deltas here loses equal-size
        // snap corrections and can make the object jump on pointer-up.
        const story = node.story_id
          ? document.stories?.find((candidate) => candidate.id === node.story_id)
          : null
        if (story?.kind === 'table') {
          const table = normalizeTableData(story.content)
          if (gesture.handle === 's') {
            const visualRows = table.rows.length + (table.header_enabled ? 1 : 0)
            table.row_height_mm = Math.max(5, finalGeometry.height / visualRows / DU_PER_MM)
          } else {
            const ratio = finalGeometry.width / Math.max(1, gesture.geometry.width)
            table.column_widths = table.column_widths.map((width) =>
              du((width || gesture.geometry.width / table.column_count) * ratio),
            )
          }
          session.execute(
            updateTableContent(gesture.id, table, {
              x: finalGeometry.x,
              y: finalGeometry.y,
              width: finalGeometry.width,
              rotation: gesture.geometry.rotation,
            }),
          )
        } else {
          const committedGeometry = {
            x: finalGeometry.x,
            y: finalGeometry.y,
            width: finalGeometry.width,
            height: finalGeometry.height,
            rotation: gesture.geometry.rotation,
          }
          if (
            node.kind === 'text' &&
            (gesture.handle === 'w' || gesture.handle === 'e') &&
            node.layout_mode === 'intrinsic'
          )
            session.execute(
              updateNodeGeometryAndProps(gesture.id, committedGeometry, {
                sizingMode: 'fixed-width',
              }),
            )
          else session.execute(updateNodeGeometry(gesture.id, committedGeometry))
        }
      } else if (gesture.kind === 'rotate') {
        const node = allScopeNodes.find((candidate) => candidate.id === gesture.id)
        if (!node) throw new Error('The rotated object is no longer available.')
        const rotation = rotationAtPointer(node, point, event.shiftKey)
        // World-space snapping is already applied before removing the parent rotation.
        session.execute(rotateNode(gesture.id, rotation / 100, false))
      }
    } catch (error) {
      reportError(error, 'The change could not be applied.')
    }
    setGesture(null)
    setPreview({})
    setGuidesFading(false)
    setGuides([])
    setBadge(null)
    snapActiveRef.current = false
  }

  const cancelGesture = () => {
    setGesture(null)
    setPreview({})
    setGuidesFading(false)
    setGuides([])
    setBadge(null)
    setMarquee(null)
    snapActiveRef.current = false
  }

  // --- keyboard contract (tools.md §35); inputs and text editing own their keys -----------

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (
      target.closest('input, textarea, select, [contenteditable="true"], [data-v5-editor-chrome]')
    )
      return
    const mod = event.metaKey || event.ctrlKey
    const key = event.key
    if (key === 'Escape') {
      event.preventDefault()
      if (menu) setMenu(null)
      else if (confirmDelete) setConfirmDelete(null)
      else if (editingText) commitTextEditing(true)
      else if (gesture || marquee) cancelGesture()
      else if (session.selectedNodeIds.length) session.selectNode(null)
      else if (session.editScopeId) session.exitGroup()
      return
    }
    if (editingText) return // text owns every other key while editing
    if (!mod && key.toLowerCase() === 'v') {
      setPanMode(false)
      session.setTool('select')
      return
    }
    if (!mod && !event.altKey && !event.shiftKey) {
      // Figma-style tool shortcuts for placement tools.
      const toolKeys: Record<
        string,
        { tool: V5Tool; variant?: 'rect' | 'ellipse' | 'line' | 'square' }
      > = {
        t: { tool: 'text' },
        l: { tool: 'shape', variant: 'line' },
        r: { tool: 'shape', variant: 'rect' },
        o: { tool: 'shape', variant: 'ellipse' },
        s: { tool: 'shape', variant: 'square' },
        i: { tool: 'image' },
        f: { tool: 'table' },
        h: { tool: 'hand' },
      }
      const binding = toolKeys[key.toLowerCase()]
      if (binding) {
        setPanMode(binding.tool === 'hand')
        session.setTool(binding.tool)
        if (binding.variant) session.setShapeVariant(binding.variant)
        return
      }
    }
    if (key === ' ') {
      setPanMode(true)
      event.preventDefault()
      return
    }
    if (mod && key.toLowerCase() === 'a') {
      event.preventDefault()
      session.selectNodes(
        visibleScopeNodes
          .filter((node) => !isEffectivelyLocked(document, node.id))
          .map((node) => node.id),
      )
      return
    }
    if (mod && key.toLowerCase() === 'c') {
      if (session.copySelection()) setBadge('Copied')
      return
    }
    if (mod && key.toLowerCase() === 'x') {
      if (session.cutSelection()) setBadge('Cut')
      return
    }
    if (mod && key.toLowerCase() === 'v') {
      if (session.clipboardCount > 0) {
        event.preventDefault()
        try {
          session.paste(event.shiftKey ? 'in-place' : 'standard')
        } catch (error) {
          setBadge(error instanceof Error ? error.message : 'Paste failed')
        }
      }
      return
    }
    if (mod && key.toLowerCase() === 'd') {
      event.preventDefault()
      performDuplicate()
      return
    }
    if (mod && key.toLowerCase() === 'g') {
      event.preventDefault()
      if (event.shiftKey) performUngroup()
      else performGroup()
      return
    }
    if (mod && (key === ']' || key === '[')) {
      event.preventDefault()
      const id = session.selectedNodeId
      if (!id) return
      if (event.altKey || event.shiftKey)
        session.execute(reorderExtreme(id, key === ']' ? 'front' : 'back'))
      else {
        const siblings = scopeChildren
        const index = siblings.findIndex((node) => node.id === id)
        session.execute(reorderNode(id, key === ']' ? index + 1 : index - 1))
      }
      return
    }
    if (mod && (key === '=' || key === '+')) {
      event.preventDefault()
      zoomByCommand(zoom * 1.2)
      return
    }
    if (mod && key === '-') {
      event.preventDefault()
      zoomByCommand(zoom / 1.2)
      return
    }
    if (mod && key === '0') {
      event.preventDefault()
      zoomByCommand(0.01)
      return
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault()
      requestDelete(session.selectedNodeIds)
      return
    }
    if (key.startsWith('Arrow') && selectedNodes.length) {
      event.preventDefault()
      const amount = event.shiftKey ? 1000 : 100
      const dx = key === 'ArrowLeft' ? -amount : key === 'ArrowRight' ? amount : 0
      const dy = key === 'ArrowUp' ? -amount : key === 'ArrowDown' ? amount : 0
      const movableIds = session.selectedNodeIds.filter((id) => !isEffectivelyLocked(document, id))
      if (movableIds.length === 0) return
      try {
        const movableNodes = selectedNodes.filter((node) => movableIds.includes(node.id))
        const union = unionSelectionBounds(movableNodes)
        if (!union) return
        const page = pages.find((candidate) => candidate.id === session.activePageId) ?? activePage
        const clampedDx = Math.min(Math.max(dx, -union.x), page.width - union.x - union.width)
        const clampedDy = Math.min(Math.max(dy, -union.y), page.height - union.y - union.height)
        if (clampedDx === 0 && clampedDy === 0) return
        const moved = { ...union, id: '__moving__', x: union.x + clampedDx, y: union.y + clampedDy }
        const exactGuides = guidesAtExactPosition(
          moved,
          snapCandidates(session.activePageId, movableIds),
        )
        session.execute(nudgeNodes(movableIds, clampedDx, clampedDy))
        setGuidesFading(false)
        setGuides(exactGuides)
        if (keyboardGuideTimerRef.current !== null)
          window.clearTimeout(keyboardGuideTimerRef.current)
        if (keyboardGuideRemovalTimerRef.current !== null)
          window.clearTimeout(keyboardGuideRemovalTimerRef.current)
        keyboardGuideTimerRef.current = window.setTimeout(() => {
          setGuidesFading(true)
          keyboardGuideTimerRef.current = null
          keyboardGuideRemovalTimerRef.current = window.setTimeout(() => {
            setGuides([])
            setGuidesFading(false)
            keyboardGuideRemovalTimerRef.current = null
          }, 75)
        }, 525)
      } catch (error) {
        reportError(error, 'The selection cannot be moved.')
      }
      return
    }
    if (key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) {
        // Select the parent of the primary selection.
        const chain = ancestorOf(primary?.id)
        const parent = chain.length > 1 ? chain[chain.length - 2] : null
        if (parent) {
          session.exitGroup()
          session.selectNode(parent.id)
        }
        return
      }
      if (primary?.role === 'group') session.enterGroup(primary.id)
      else if (primary?.kind === 'text') startTextEditing(primary)
      else if (
        primary?.role === 'flow-frame' &&
        primary.story_id &&
        document.stories?.some((story) => story.id === primary.story_id && story.kind === 'table')
      ) {
        setEditingTableId(primary.id)
        setActiveTableCell(null)
        setTableCellSelection(null)
      }
      return
    }
    if ((key === ',' || key === '.') && primary && canRotate(primary)) {
      event.preventDefault()
      const step = event.shiftKey ? 15 : 1
      const next = (primary.geometry.rotation / 100 + (key === '.' ? step : -step)) * 100
      session.execute(rotateNode(primary.id, next / 100, false))
      return
    }
    if (event.altKey && event.shiftKey && key.toLowerCase() === 'l' && primary) {
      event.preventDefault()
      session.execute(setNodeLocked(primary.id, !primary.locked))
      return
    }
    if (key === 'Tab' && session.selectedNodeId) {
      event.preventDefault()
      const siblings = scopeChildren
      const index = siblings.findIndex((node) => node.id === session.selectedNodeId)
      const next = event.shiftKey
        ? siblings[(index - 1 + siblings.length) % siblings.length]
        : siblings[(index + 1) % siblings.length]
      session.selectNode(next.id)
      return
    }
  }

  const ancestorOf = (id?: string | null): V5Node[] => {
    if (!id) return []
    const visit = (nodes: V5Node[], trail: V5Node[]): V5Node[] | null => {
      for (const node of nodes) {
        if (node.id === id) return [...trail, node]
        const found = visit(node.children ?? [], [...trail, node])
        if (found) return found
      }
      return null
    }
    return visit(activePage.children, []) ?? []
  }

  /** Selection chrome rect in fixed viewport coordinates for screen-space toolbars. */
  const primaryViewportRect = (id: string): Bounds => {
    const rect = hostRef.current
      ?.querySelector(`[data-v5-node-id="${id}"]`)
      ?.getBoundingClientRect()
    return rect
      ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
      : { x: -9999, y: -9999, width: 0, height: 0 }
  }

  const onKeyUp = (event: React.KeyboardEvent) => {
    if (event.key === ' ') setPanMode(false)
  }

  // Non-passive wheel handling: ctrl/cmd zooms at the cursor, plain wheel pans natively.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (nativeEvent: WheelEvent) => {
      if (nativeEvent.ctrlKey || nativeEvent.metaKey) {
        nativeEvent.preventDefault()
        const factor = nativeEvent.deltaY < 0 ? 1.1 : 1 / 1.1
        const baseZoom = pendingZoomRef.current?.targetZoom ?? session.zoom
        setZoomAt(baseZoom * factor, nativeEvent.clientX, nativeEvent.clientY)
      }
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Preserve the document coordinate at viewport center when drawers/Inspector change width.
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return
    let previous = { width: host.clientWidth, height: host.clientHeight }
    setViewportSize(previous)
    const observer = new ResizeObserver(() => {
      const next = { width: host.clientWidth, height: host.clientHeight }
      if (previous.width && previous.height) {
        const previousLayout = layoutPageStack(pages, zoom, previous)
        const anchor = anchorAt(previousLayout, pages, zoom, {
          x: host.scrollLeft + previous.width / 2,
          y: host.scrollTop + previous.height / 2,
        })
        const nextLayout = layoutPageStack(pages, zoom, next)
        const target = anchor && contentPointForAnchor(nextLayout, anchor, zoom)
        host.scrollTo({
          left: target ? target.x - next.width / 2 : host.scrollLeft,
          top: target ? target.y - next.height / 2 : host.scrollTop,
        })
      }
      setViewportSize(next)
      previous = next
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [pages, zoom])

  // --- selection chrome geometry -----------------------------------------------------------

  const selectionBounds = (node: V5Node): Bounds => {
    return nodeProjection(node).bounds
  }
  const unionSelectionBounds = (nodes: V5Node[]): Bounds | null => {
    if (!nodes.length) return null
    const points = nodes.flatMap((node) => {
      const box = selectionBounds(node)
      return [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
      ]
    })
    return boundsForPoints(points)
  }
  const resizeHandlesFor = (node: V5Node): ResizeHandle[] => {
    if (node.role === 'group' || isEffectivelyLocked(document, node.id)) return []
    const capability = getV5Widget(node.kind)
    const canX = capability?.canResizeX ?? false
    const canY = node.layout_mode === 'intrinsic' ? false : (capability?.canResizeY ?? false)
    const story = node.story_id
      ? document.stories?.find((candidate) => candidate.id === node.story_id)
      : null
    if (story?.kind === 'table') return ['w', 'e', 's']
    if (node.kind === 'shape' && (node.props as V5ShapeProps).variant === 'line') return ['w', 'e']
    if (canX && canY) return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
    if (canX) return ['w', 'e']
    if (canY) return ['n', 's']
    return []
  }
  const activeTransform =
    gesture?.kind === 'resize' ||
    gesture?.kind === 'rotate' ||
    (gesture?.kind === 'move' && gesture.activated)
  const singleSelected = selectedNodes.length === 1 && primary
  const showSelection = !!singleSelected && !editingText && !editingTableId
  const selectionLocked = selectedNodes.some((node) => isEffectivelyLocked(document, node.id))

  const toolbarActions: ToolbarAction[] = useMemo(() => {
    if (!primary) return []
    const actions: ToolbarAction[] = []
    if (selectionLocked) {
      actions.push({
        id: 'properties',
        label: 'Open properties',
        icon: Pencil,
        run: () => setInspectorOpen(true),
      })
      if (selectedNodes.every((node) => node.locked))
        actions.push({
          id: 'unlock',
          label: 'Unlock',
          icon: Unlock,
          run: () => session.execute(setNodesLocked(session.selectedNodeIds, false)),
        })
      return actions
    }
    if (selectedNodes.length === 1) {
      if (primary.kind === 'text')
        actions.push({
          id: 'edit',
          label: 'Edit text',
          icon: Type,
          run: () => startTextEditing(primary),
        })
      else if (primary.kind === 'image')
        actions.push({
          id: 'edit',
          label: 'Replace image',
          icon: ImageIcon,
          run: () => setInspectorOpen(true),
        })
      else if (primary.role === 'flow-frame') {
        actions.push({
          id: 'edit',
          label: 'Edit table',
          icon: Table2,
          run: () => {
            setEditingTableId(primary.id)
            setActiveTableCell(null)
            setTableCellSelection(null)
          },
        })
        const story = primary.story_id
          ? document.stories?.find((candidate) => candidate.id === primary.story_id)
          : null
        if (story?.kind === 'table') {
          actions.push({
            id: 'add-row',
            label: activeTableCell ? 'Add row below' : 'Add row at end',
            run: () => {
              const table = normalizeTableData(story.content)
              const index = activeTableCell
                ? Math.max(0, Math.min(table.rows.length, activeTableCell.row + 1))
                : table.rows.length
              session.execute(updateTableContent(primary.id, insertTableRow(table, index)))
            },
          })
          actions.push({
            id: 'add-column',
            label: activeTableCell ? 'Add column right' : 'Add column at end',
            run: () => {
              const table = normalizeTableData(story.content)
              const index = activeTableCell
                ? Math.min(table.column_count, activeTableCell.column + 1)
                : table.column_count
              session.execute(updateTableContent(primary.id, insertTableColumn(table, index)))
            },
          })
        }
      } else if (primary.kind !== 'shape')
        actions.push({
          id: 'edit',
          label: 'Edit properties',
          icon: Pencil,
          run: () => setInspectorOpen(true),
        })
    }
    if (!actions.some((action) => action.id === 'properties'))
      actions.push({
        id: 'properties',
        label: 'Open properties',
        icon: Settings2,
        run: () => setInspectorOpen(true),
      })
    if (selectedNodes.length >= 2)
      actions.push({ id: 'group', label: 'Group', shortcut: '⌘G', icon: Group, run: performGroup })
    if (primary.role === 'group')
      actions.push({
        id: 'ungroup',
        label: 'Ungroup',
        shortcut: '⌘⇧G',
        icon: Ungroup,
        run: performUngroup,
      })
    actions.push({
      id: 'duplicate',
      label: 'Duplicate',
      shortcut: '⌘D',
      icon: Copy,
      run: performDuplicate,
    })
    actions.push({
      id: 'position',
      label: 'Position',
      icon: AlignHorizontalJustifyCenter,
      menu: [
        {
          label: 'Align left',
          run: () => (selectedNodes.length > 1 ? performAlign('left') : alignSingle('left')),
        },
        {
          label: 'Align center',
          run: () =>
            selectedNodes.length > 1 ? performAlign('center-x') : alignSingle('center-x'),
        },
        {
          label: 'Align right',
          run: () => (selectedNodes.length > 1 ? performAlign('right') : alignSingle('right')),
        },
        {
          label: 'Align top',
          run: () => (selectedNodes.length > 1 ? performAlign('top') : alignSingle('top')),
        },
        {
          label: 'Align middle',
          run: () =>
            selectedNodes.length > 1 ? performAlign('center-y') : alignSingle('center-y'),
        },
        {
          label: 'Align bottom',
          run: () => (selectedNodes.length > 1 ? performAlign('bottom') : alignSingle('bottom')),
        },
        { label: 'Distribute horizontally', run: () => performDistribute('x') },
        { label: 'Distribute vertically', run: () => performDistribute('y') },
        { label: 'Bring forward', run: () => shiftOrder(1) },
        { label: 'Send backward', run: () => shiftOrder(-1) },
        {
          label: 'Bring to front',
          run: () => session.execute(reorderExtreme(primary.id, 'front')),
        },
        { label: 'Send to back', run: () => session.execute(reorderExtreme(primary.id, 'back')) },
      ],
    })
    return actions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary, selectedNodes.length, selectionLocked, activeTableCell])

  const shiftOrder = (delta: number) => {
    const id = primary?.id
    if (!id) return
    const siblings = scopeChildren
    const index = siblings.findIndex((node) => node.id === id)
    try {
      session.execute(reorderNode(id, index + delta))
    } catch (error) {
      reportError(error, 'The stacking order could not be changed.')
    }
  }

  const moreItems: MenuItem[] = primary
    ? selectionLocked
      ? [
          ...(selectedNodes.every((node) => node.locked)
            ? [
                {
                  label: 'Unlock',
                  run: () => session.execute(setNodesLocked(session.selectedNodeIds, false)),
                },
              ]
            : []),
          {
            label: 'Hide',
            run: () => {
              session.execute(setNodesVisibility(session.selectedNodeIds, 'hidden'))
              session.selectNode(null)
            },
          },
          { label: 'Open properties', run: () => setInspectorOpen(true) },
        ]
      : [
          ...(primary.role === 'flow-frame' && primary.story_id
            ? (() => {
                const story = document.stories?.find(
                  (candidate) => candidate.id === primary.story_id,
                )
                if (story?.kind !== 'table') return []
                const table = normalizeTableData(story.content)
                const rowIndex =
                  activeTableCell && activeTableCell.row >= 0
                    ? Math.min(activeTableCell.row, table.rows.length - 1)
                    : table.rows.length - 1
                const columnIndex = activeTableCell
                  ? Math.min(activeTableCell.column, table.column_count - 1)
                  : table.column_count - 1
                const removeRow = () => {
                  const run = () =>
                    session.execute(updateTableContent(primary.id, removeTableRow(table, rowIndex)))
                  if (table.rows[rowIndex]?.some(Boolean))
                    setConfirmTableAction({
                      message: 'This row contains content. Delete it?',
                      run,
                    })
                  else run()
                }
                const removeColumn = () => {
                  const populated = [
                    table.headers[columnIndex],
                    ...table.rows.map((row) => row[columnIndex]),
                  ].some(Boolean)
                  const run = () =>
                    session.execute(
                      updateTableContent(primary.id, removeTableColumn(table, columnIndex)),
                    )
                  if (populated)
                    setConfirmTableAction({
                      message: 'This column contains content. Delete it?',
                      run,
                    })
                  else run()
                }
                return [
                  ...(table.rows.length > 1
                    ? [
                        {
                          label: activeTableCell ? 'Delete active row' : 'Remove last row',
                          destructive: table.rows[rowIndex]?.some(Boolean),
                          run: removeRow,
                        },
                      ]
                    : []),
                  ...(table.column_count > 1
                    ? [
                        {
                          label: activeTableCell ? 'Delete active column' : 'Remove last column',
                          destructive: [
                            table.headers[columnIndex],
                            ...table.rows.map((row) => row[columnIndex]),
                          ].some(Boolean),
                          run: removeColumn,
                        },
                      ]
                    : []),
                  { separator: true },
                ] as MenuItem[]
              })()
            : []),
          {
            label: 'Copy',
            shortcut: '⌘C',
            run: () => setBadge(session.copySelection() ? 'Copied' : null),
          },
          {
            label: 'Cut',
            shortcut: '⌘X',
            run: () => setBadge(session.cutSelection() ? 'Cut' : null),
          },
          {
            label: selectedNodes.every((node) => node.locked) ? 'Unlock' : 'Lock',
            run: () =>
              session.execute(
                setNodesLocked(
                  session.selectedNodeIds,
                  !selectedNodes.every((node) => node.locked),
                ),
              ),
          },
          {
            label: selectedNodes.every((node) => node.visibility === 'hidden') ? 'Show' : 'Hide',
            run: () => {
              const hide = !selectedNodes.every((node) => node.visibility === 'hidden')
              session.execute(
                setNodesVisibility(session.selectedNodeIds, hide ? 'hidden' : 'shown'),
              )
              if (hide) session.selectNode(null)
            },
          },
          { label: 'Open properties', run: () => setInspectorOpen(true) },
          { label: 'Delete', destructive: true, run: () => requestDelete(session.selectedNodeIds) },
        ]
    : []

  const openContextMenu = (event: React.MouseEvent, node: V5Node | null) => {
    event.preventDefault()
    if (
      node &&
      !session.selectedNodeIds.includes(node.id) &&
      !isEffectivelyLocked(document, node.id)
    ) {
      session.selectNode(node.id)
    }
    const targetIds =
      node && !session.selectedNodeIds.includes(node.id) ? [node.id] : session.selectedNodeIds
    const targetNodes = targetIds
      .map((id) => allScopeNodes.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is V5Node => Boolean(candidate))
    const targetLocked = targetNodes.some((candidate) =>
      isEffectivelyLocked(document, candidate.id),
    )
    const targetAllLocked =
      targetNodes.length > 0 && targetNodes.every((candidate) => candidate.locked)
    const items: MenuItem[] = []
    if (targetIds.length) {
      if (!targetLocked) {
        items.push(
          {
            label: 'Copy',
            shortcut: '⌘C',
            run: () => setBadge(session.copySelection() ? 'Copied' : null),
          },
          {
            label: 'Cut',
            shortcut: '⌘X',
            run: () => setBadge(session.cutSelection() ? 'Cut' : null),
          },
        )
      }
      items.push(
        {
          label: targetAllLocked ? 'Unlock' : 'Lock',
          run: () => session.execute(setNodesLocked(targetIds, !targetAllLocked)),
        },
        {
          label: 'Hide',
          run: () => {
            session.execute(setNodesVisibility(targetIds, 'hidden'))
            session.selectNode(null)
          },
        },
        { label: 'Open properties', run: () => setInspectorOpen(true) },
      )
      if (!targetLocked)
        items.push({ label: 'Delete', destructive: true, run: () => requestDelete(targetIds) })
    }
    if (session.clipboardCount > 0)
      items.splice(node ? Math.min(2, items.length) : 0, 0, {
        label: 'Paste',
        shortcut: '⌘V',
        run: () => {
          try {
            const pasted = session.paste(
              'standard',
              docPointFromClient(event.clientX, event.clientY),
            )
            if (pasted.length) setBadge('Pasted')
          } catch (error) {
            reportError(error, 'Paste failed.')
          }
        },
      })
    if (!node && !session.selectedNodeIds.length) {
      if (session.clipboardCount > 0) items.push({ separator: true, label: '' })
      items.push(
        {
          label: 'Select all on page',
          shortcut: '⌘A',
          run: () =>
            session.selectNodes(
              visibleScopeNodes
                .filter((candidate) => !isEffectivelyLocked(document, candidate.id))
                .map((candidate) => candidate.id),
            ),
        },
        {
          label: 'Duplicate page',
          run: () =>
            session.execute(
              duplicatePage(session.activePageId, session.nextID('page'), (prefix) =>
                session.nextID(prefix),
              ),
            ),
        },
        {
          label: 'Add page',
          run: () =>
            session.execute(addPage(session.nextID('page'), session.document.settings.orientation)),
        },
      )
    }
    if (items.length) setMenu({ x: event.clientX, y: event.clientY, items })
  }

  const draggedPreset = libraryDrag
    ? (V5_TOOL_PRESETS.find((preset) => preset.id === libraryDrag.presetId) ?? null)
    : null
  const libraryDragTarget = libraryDrag
    ? ((
        hostRef.current?.ownerDocument.elementFromPoint(
          libraryDrag.clientX,
          libraryDrag.clientY,
        ) as HTMLElement | null
      )?.closest?.('[data-v5-page-id]') as HTMLElement | null)
    : null
  const libraryDragPageId = libraryDragTarget?.getAttribute('data-v5-page-id') ?? null

  const insertExternalImage = async (file: File, pageId: string, point: Point, client: Point) => {
    const started = performance.now()
    let result = 'success'
    try {
      const image = await readValidatedImage(file)
      const preset = V5_TOOL_PRESETS.find((candidate) => candidate.id === 'image')
      if (!preset) throw new Error('Image insertion is unavailable.')
      if (pageId !== session.activePageId) session.setActivePage(pageId)
      insertPresetAt(preset, pageId, point, {
        source: image.source,
        intrinsicWidth: image.width,
        intrinsicHeight: image.height,
      })
      session.setTool('select')
    } catch (error) {
      result = 'error'
      setFeedback({
        message: error instanceof Error ? error.message : 'The image could not be inserted.',
        tone: 'error',
        clientX: client.x,
        clientY: client.y,
      })
    } finally {
      void RecordDiagnosticsOperation('image.import', performance.now() - started, result, {
        input_bytes_bucket: file.size > 0 ? Math.ceil(Math.log2(file.size)) : 0,
      }).catch(() => undefined)
    }
  }
  const portalHost = hostRef.current?.ownerDocument.body

  return (
    <div
      ref={hostRef}
      data-v5-canvas
      tabIndex={0}
      className="relative min-h-0 min-w-0 flex-1 overflow-auto outline-none"
      style={{
        cursor:
          panMode || session.tool === 'hand'
            ? 'grab'
            : session.tool === 'select'
              ? 'default'
              : 'crosshair',
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPaste={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return
        if (session.clipboardCount > 0) return
        const point = { x: activePage.width / 2, y: activePage.height / 2 }
        const files = Array.from(event.clipboardData.files)
        if (files.length) {
          event.preventDefault()
          if (files.length !== 1) {
            setBadge('Paste one image at a time')
            return
          }
          const rect = hostRef.current?.getBoundingClientRect()
          void insertExternalImage(files[0], activePage.id, point, {
            x: rect ? rect.left + rect.width / 2 : 0,
            y: rect ? rect.top + rect.height / 2 : 0,
          })
          return
        }
        const plainText = event.clipboardData.getData('text/plain')
        if (!plainText) return
        event.preventDefault()
        if (plainText.length > 20_000) {
          setBadge('Pasted text must be 20,000 characters or fewer')
          return
        }
        const preset = V5_TOOL_PRESETS.find((candidate) => candidate.id === 'body-text')
        if (!preset) return
        insertPresetAt(preset, activePage.id, point, { text: plainText }, undefined, true)
      }}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement
        if (!target.closest('button, input, textarea, select, [contenteditable="true"]'))
          hostRef.current?.focus({ preventScroll: true })
        // Space-hand, the Hand tool, and middle-drag pan own the pointer before object
        // interaction; capture phase keeps node handlers from starting a move instead.
        if (panMode || session.tool === 'hand' || event.button === 1) {
          event.preventDefault()
          event.stopPropagation()
          beginPan(event)
          return
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const target = event.target as HTMLElement
        if (
          target.closest(
            '[data-v5-page-id], [data-v5-editor-chrome], [data-v5-context-toolbar], [data-v5-context-menu], [data-v5-zoom-controls]',
          )
        )
          return
        if (editingText) commitTextEditing(false)
        session.selectNode(null)
        setMenu(null)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={cancelGesture}
      onPointerLeave={() => setHoverId(null)}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        const pageElement = (event.target as HTMLElement).closest(
          '[data-v5-page-id]',
        ) as HTMLElement | null
        const pageId = pageElement?.getAttribute('data-v5-page-id') ?? ''
        if (!pageId) {
          setFeedback({
            message: 'Drop the image on an authored page.',
            tone: 'error',
            clientX: event.clientX,
            clientY: event.clientY,
          })
          return
        }
        if (event.dataTransfer.files.length !== 1) {
          setFeedback({
            message: 'Drop one image at a time.',
            tone: 'error',
            clientX: event.clientX,
            clientY: event.clientY,
          })
          return
        }
        const point = docPointFromClient(event.clientX, event.clientY, pageId)
        void insertExternalImage(event.dataTransfer.files[0], pageId, point, {
          x: event.clientX,
          y: event.clientY,
        })
      }}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement
        const nodeId =
          target.closest?.('[data-v5-node-id]')?.getAttribute('data-v5-node-id') ?? null
        const node = nodeId ? findNode(activePage.children, nodeId) : null
        openContextMenu(event, node)
      }}
    >
      {(() => {
        const target = editingText
          ? allScopeNodes.find((node) => node.id === editingText.id)
          : selectedNodes.length === 1
            ? primary
            : null
        if (!target || activeTransform || selectionLocked) return null
        if (target.kind === 'text')
          return (
            <TextFormattingStrip
              node={target}
              bounds={primaryViewportRect(target.id)}
              viewport={hostRef.current?.getBoundingClientRect()}
              onUpdate={(patch) => updateTextFormatting(target, patch)}
              onOpenInspector={() => setInspectorOpen(true)}
              more={moreItems}
              colorPickerOpen={openToolbarPalette === 'text'}
              onColorPickerOpenChange={(open) => setToolbarPalette(open ? 'text' : null)}
              onColorPickerDragStart={() => {
                toolbarPaletteDragCloseRef.current = true
              }}
              onColorPickerDismissIntent={() => {
                toolbarPaletteDragCloseRef.current = false
              }}
            />
          )
        if (target.kind === 'shape')
          return (
            <ShapeFormattingStrip
              node={target}
              bounds={primaryViewportRect(target.id)}
              viewport={hostRef.current?.getBoundingClientRect()}
              onUpdate={(patch) => session.execute(updateNodeProps(target.id, patch))}
              onOpenInspector={() => setInspectorOpen(true)}
              more={moreItems}
              openPalette={
                openToolbarPalette === 'fill' || openToolbarPalette === 'stroke'
                  ? openToolbarPalette
                  : null
              }
              onOpenPaletteChange={setToolbarPalette}
              onColorPickerDragStart={() => {
                toolbarPaletteDragCloseRef.current = true
              }}
              onColorPickerDismissIntent={() => {
                toolbarPaletteDragCloseRef.current = false
              }}
            />
          )
        return null
      })()}
      <div
        className="v5-page-stack relative"
        style={{ width: contentSize.width, height: contentSize.height }}
      >
        {pages.map((page, pageIndex) => {
          const offset = pageOffsets[pageIndex]
          const isActive = page.id === session.activePageId
          return (
            <section
              key={page.id}
              data-v5-page-id={page.id}
              aria-label={`Page ${pageIndex + 1}`}
              onPointerDown={(event) => {
                if (event.target !== event.currentTarget) return
                event.preventDefault()
                if (keyboardGuideTimerRef.current !== null)
                  window.clearTimeout(keyboardGuideTimerRef.current)
                if (keyboardGuideRemovalTimerRef.current !== null)
                  window.clearTimeout(keyboardGuideRemovalTimerRef.current)
                setGuidesFading(false)
                setGuides([])
                if (editingText) commitTextEditing(false)
                if (editingTableId) {
                  setEditingTableId(null)
                  setActiveTableCell(null)
                  setTableCellSelection(null)
                }
                // A page is a document container, not a selectable canvas object. Clicking it
                // merely establishes the active insertion/selection context.
                if (page.id !== session.activePageId) session.setActivePage(page.id)
                const doc = docPointFromClient(event.clientX, event.clientY, page.id)
                if (
                  !panMode &&
                  (session.tool === 'text' ||
                    session.tool === 'shape' ||
                    session.tool === 'image' ||
                    session.tool === 'table')
                ) {
                  // Placement tools draw a ghost rect; click inserts the default size.
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setGesture({ kind: 'place', pageId: page.id, startDoc: doc, currentDoc: doc })
                  return
                }
                setMarquee({
                  pageId: page.id,
                  startDoc: doc,
                  currentDoc: doc,
                  additive: event.shiftKey,
                  base: page.id === session.activePageId ? session.selectedNodeIds : [],
                  activated: false,
                })
              }}
              style={{
                position: 'absolute',
                left: offset.x,
                top: offset.y,
                width: page.width * zoom,
                height: page.height * zoom,
                background: 'white',
                boxShadow:
                  libraryDragPageId === page.id
                    ? '0 1px 6px rgb(0 0 0 / .18), inset 0 0 0 2px rgb(37 99 235 / .55)'
                    : '0 1px 6px rgb(0 0 0 / .18)',
                border: '1px solid #d7dce3',
              }}
            >
              {session.editScopeId && isActive
                ? scopeNode
                  ? (() => {
                      const projection = nodeProjection(scopeNode)
                      return (
                        <>
                          <div
                            aria-label="Group scope boundary"
                            style={{
                              position: 'absolute',
                              left: projection.origin.x * zoom,
                              top: projection.origin.y * zoom,
                              width: projection.width * zoom,
                              height: projection.height * zoom,
                              transform: `rotate(${projection.rotation / 100}deg)`,
                              transformOrigin: 'center',
                              border: '1px dashed rgb(96 165 250 / .8)',
                              pointerEvents: 'none',
                            }}
                          />
                          <button
                            type="button"
                            className="absolute z-10 rounded-full border bg-background px-2 py-0.5 text-[11px] shadow-sm hover:bg-accent"
                            style={{
                              left: projection.bounds.x * zoom,
                              top: projection.bounds.y * zoom - 28,
                            }}
                            onClick={() => session.exitGroup()}
                          >
                            {scopeNode.name ?? 'Group'} · Exit
                          </button>
                        </>
                      )
                    })()
                  : null
                : null}
              {page.children
                .filter((node) => !isEffectivelyHidden(document, node.id))
                .map((node) => (
                  <NodeView
                    key={node.id}
                    node={node}
                    zoom={zoom}
                    preview={preview[node.id]}
                    previews={preview}
                    interactiveIds={isActive ? interactiveIds : new Set<string>()}
                    hiddenIds={hiddenIds}
                    stories={document.stories ?? []}
                    editing={editingText?.id === node.id}
                    onPointerDown={beginMove}
                    onDoubleClick={(target, event) => {
                      if (target.role === 'group') session.enterGroup(target.id)
                      else if (target.kind === 'text') startTextEditing(target)
                      else if (
                        target.story_id &&
                        document.stories?.find((story) => story.id === target.story_id)?.kind ===
                          'table'
                      ) {
                        const story = document.stories?.find(
                          (candidate) => candidate.id === target.story_id,
                        )
                        const rect = event.currentTarget.getBoundingClientRect()
                        setEditingTableId(target.id)
                        setActiveTableCell(
                          story
                            ? tableCellAtPoint(
                                normalizeTableData(story.content),
                                (event.clientX - rect.left) / zoom,
                                (event.clientY - rect.top) / zoom,
                                target.geometry.width,
                              )
                            : null,
                        )
                        setTableCellSelection(null)
                      }
                    }}
                  />
                ))}
              {editingTableId &&
                isActive &&
                (() => {
                  const tableNode = allScopeNodes.find((node) => node.id === editingTableId)
                  const tableStory = tableNode?.story_id
                    ? document.stories?.find((story) => story.id === tableNode.story_id)
                    : null
                  if (!tableNode || tableStory?.kind !== 'table') return null
                  const tableProjection = nodeProjection(tableNode)
                  return (
                    <>
                      <TableEditor
                        node={{
                          ...tableNode,
                          geometry: {
                            x: tableProjection.origin.x,
                            y: tableProjection.origin.y,
                            width: tableProjection.width,
                            height: tableProjection.height,
                            rotation: tableProjection.rotation,
                          },
                        }}
                        story={tableStory}
                        zoom={zoom}
                        onUpdate={(table) =>
                          session.execute(updateTableContent(tableNode.id, table))
                        }
                        activeCell={activeTableCell}
                        cellSelection={tableCellSelection}
                        onActiveCellChange={(cell) => {
                          setActiveTableCell(cell)
                          setTableCellSelection(null)
                        }}
                        onExit={() => {
                          setEditingTableId(null)
                          setActiveTableCell(null)
                          setTableCellSelection(null)
                        }}
                        onCellContextMenu={(event, cell) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setActiveTableCell(cell)
                          const source = normalizeTableData(tableStory.content)
                          const commit = (next: ReturnType<typeof normalizeTableData>) =>
                            session.execute(updateTableContent(tableNode.id, next))
                          const guarded = (message: string, populated: boolean, run: () => void) =>
                            populated ? () => setConfirmTableAction({ message, run }) : run
                          const row = Math.max(0, cell.row)
                          const column = cell.column
                          const items: MenuItem[] = [
                            {
                              label: 'Insert row above',
                              run: () => commit(insertTableRow(source, row)),
                            },
                            {
                              label: 'Insert row below',
                              run: () =>
                                commit(
                                  insertTableRow(source, Math.min(source.rows.length, row + 1)),
                                ),
                            },
                            {
                              label: 'Insert column left',
                              run: () => commit(insertTableColumn(source, column)),
                            },
                            {
                              label: 'Insert column right',
                              run: () => commit(insertTableColumn(source, column + 1)),
                            },
                            { separator: true, label: '' },
                            {
                              label: cell.row < 0 ? 'Select header row' : `Select row ${row + 1}`,
                              run: () => {
                                setTableCellSelection({ axis: 'row', index: cell.row })
                                setBadge(
                                  cell.row < 0 ? 'Header row selected' : `Row ${row + 1} selected`,
                                )
                              },
                            },
                            {
                              label: `Select column ${column + 1}`,
                              run: () => {
                                setTableCellSelection({ axis: 'column', index: column })
                                setBadge(`Column ${column + 1} selected`)
                              },
                            },
                          ]
                          if (cell.row >= 0 && source.rows.length > 1)
                            items.push({
                              label: 'Delete row',
                              destructive: source.rows[cell.row]?.some(Boolean),
                              run: guarded(
                                'This row contains content. Delete it?',
                                source.rows[cell.row]?.some(Boolean) ?? false,
                                () => commit(removeTableRow(source, cell.row)),
                              ),
                            })
                          if (source.column_count > 1) {
                            const populated = [
                              source.headers[column],
                              ...source.rows.map((rowValue) => rowValue[column]),
                            ].some(Boolean)
                            items.push({
                              label: 'Delete column',
                              destructive: populated,
                              run: guarded(
                                'This column contains content. Delete it?',
                                populated,
                                () => commit(removeTableColumn(source, column)),
                              ),
                            })
                          }
                          setMenu({ x: event.clientX, y: event.clientY, items })
                        }}
                      />
                      <SelectionOverlay
                        bounds={{
                          x: tableProjection.origin.x * zoom,
                          y: tableProjection.origin.y * zoom,
                          width: tableProjection.width * zoom,
                          height: tableProjection.height * zoom,
                        }}
                        rotation={tableProjection.rotation}
                      />
                    </>
                  )
                })()}
              {editingText &&
                isActive &&
                (() => {
                  const edited = allScopeNodes.find((candidate) => candidate.id === editingText.id)!
                  const projection = nodeProjection(edited)
                  const geometry = {
                    x: projection.origin.x,
                    y: projection.origin.y,
                    width: projection.width,
                    height: projection.height,
                    rotation: projection.rotation,
                  }
                  return (
                    <>
                      <TextEditor
                        node={edited}
                        geometry={geometry}
                        zoom={zoom}
                        value={editingText.value}
                        onChange={(value) => setEditingText({ ...editingText, value })}
                        onCommit={() => commitTextEditing(false)}
                        onCancel={() => commitTextEditing(true)}
                        onAutoFrame={(frame) => handleTextAutoFrame(editingText.id, frame)}
                      />
                      <SelectionOverlay
                        bounds={{
                          x: geometry.x * zoom,
                          y: geometry.y * zoom,
                          width: geometry.width * zoom,
                          height: geometry.height * zoom,
                        }}
                        rotation={geometry.rotation}
                      />
                    </>
                  )
                })()}
              {isActive && showSelection && primary && (
                <SelectionOverlay
                  bounds={(() => {
                    const projection = nodeProjection(primary)
                    return {
                      x: projection.origin.x * zoom,
                      y: projection.origin.y * zoom,
                      width: projection.width * zoom,
                      height: projection.height * zoom,
                    }
                  })()}
                  rotation={nodeProjection(primary).rotation}
                  handles={activeTransform ? [] : resizeHandlesFor(primary)}
                  onHandlePointerDown={beginResize}
                  onRotatePointerDown={beginRotate}
                  canRotate={!activeTransform && canRotate(primary)}
                  locked={selectionLocked}
                  measurement={badge ? { label: badge, placement: 'bottom' } : null}
                />
              )}
              {isActive &&
                showSelection &&
                primary?.role === 'flow-frame' &&
                primary.story_id &&
                (() => {
                  const story = document.stories?.find(
                    (candidate) => candidate.id === primary.story_id && candidate.kind === 'table',
                  )
                  if (!story || selectionLocked) return null
                  const table = normalizeTableData(story.content)
                  const projection = nodeProjection(primary)
                  const addRow = () => {
                    if (table.rows.length >= 500) return
                    session.execute(
                      updateTableContent(primary.id, insertTableRow(table, table.rows.length)),
                    )
                  }
                  const addColumn = () => {
                    if (table.column_count >= 12) return
                    session.execute(
                      updateTableContent(primary.id, insertTableColumn(table, table.column_count)),
                    )
                  }
                  return (
                    <>
                      <button
                        type="button"
                        data-v5-editor-chrome
                        aria-label="Add row at end"
                        disabled={table.rows.length >= 500}
                        className="absolute z-20 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border border-primary bg-background text-primary shadow-sm hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
                        style={{
                          left: (projection.origin.x + projection.width / 2) * zoom,
                          top: (projection.origin.y + projection.height) * zoom + 8,
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={addRow}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        data-v5-editor-chrome
                        aria-label="Add column at end"
                        disabled={table.column_count >= 12}
                        className="absolute z-20 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-primary bg-background text-primary shadow-sm hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
                        style={{
                          left: (projection.origin.x + projection.width) * zoom + 8,
                          top: (projection.origin.y + projection.height / 2) * zoom,
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={addColumn}
                      >
                        +
                      </button>
                    </>
                  )
                })()}
              {isActive && selectedNodes.length > 1 && (
                <>
                  {selectedNodes.map((node) => {
                    const projection = nodeProjection(node)
                    return (
                      <MemberSelectionOutline
                        key={node.id}
                        bounds={{
                          x: projection.origin.x * zoom,
                          y: projection.origin.y * zoom,
                          width: projection.width * zoom,
                          height: projection.height * zoom,
                        }}
                        rotation={projection.rotation}
                        primary={node.id === primary?.id}
                      />
                    )
                  })}
                  {unionSelectionBounds(selectedNodes) &&
                    (() => {
                      const box = unionSelectionBounds(selectedNodes)!
                      return (
                        <SelectionOverlay
                          kind="union"
                          bounds={{
                            x: box.x * zoom,
                            y: box.y * zoom,
                            width: box.width * zoom,
                            height: box.height * zoom,
                          }}
                          measurement={badge ? { label: badge, placement: 'bottom' } : null}
                        />
                      )
                    })()}
                </>
              )}
              {isActive &&
                hoverId &&
                !session.selectedNodeIds.includes(hoverId) &&
                (() => {
                  const node = allScopeNodes.find((candidate) => candidate.id === hoverId)
                  if (!node || isEffectivelyLocked(document, node.id)) return null
                  const projection = nodeProjection(node)
                  return (
                    <HoverOutline
                      bounds={{
                        x: projection.origin.x * zoom,
                        y: projection.origin.y * zoom,
                        width: projection.width * zoom,
                        height: projection.height * zoom,
                      }}
                      rotation={projection.rotation}
                    />
                  )
                })()}
              {gesture?.kind === 'place' && gesture.pageId === page.id && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    ...placeGhostRect(gesture),
                    border: '1px dashed #2563eb',
                    background: '#2563eb10',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {libraryDrag && draggedPreset && libraryDragPageId === page.id && (
                <div
                  aria-label={`${draggedPreset.label} placement preview`}
                  style={(() => {
                    const point = docPointFromClient(
                      libraryDrag.clientX,
                      libraryDrag.clientY,
                      page.id,
                    )
                    return {
                      position: 'absolute',
                      left: (point.x - draggedPreset.size.width / 2) * zoom,
                      top: (point.y - draggedPreset.size.height / 2) * zoom,
                      width: draggedPreset.size.width * zoom,
                      height: draggedPreset.size.height * zoom,
                      border: '1px dashed #2563eb',
                      background: 'rgb(37 99 235 / .08)',
                      pointerEvents: 'none',
                    }
                  })()}
                />
              )}
              {isActive &&
                marqueeCandidates.map((node) => {
                  const projection = nodeProjection(node)
                  return (
                    <MemberSelectionOutline
                      key={`candidate-${node.id}`}
                      bounds={{
                        x: projection.origin.x * zoom,
                        y: projection.origin.y * zoom,
                        width: projection.width * zoom,
                        height: projection.height * zoom,
                      }}
                      rotation={projection.rotation}
                    />
                  )
                })}
              {marquee?.pageId === page.id && marquee.activated && (
                <div
                  aria-label="Marquee selection"
                  style={{
                    position: 'absolute',
                    left: Math.min(marquee.startDoc.x, marquee.currentDoc.x) * zoom,
                    top: Math.min(marquee.startDoc.y, marquee.currentDoc.y) * zoom,
                    width: Math.abs(marquee.currentDoc.x - marquee.startDoc.x) * zoom,
                    height: Math.abs(marquee.currentDoc.y - marquee.startDoc.y) * zoom,
                    border: '1px solid #2563eb',
                    background: '#2563eb14',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {isActive &&
                guides.map((guide) => (
                  <div
                    key={guide.id}
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      ...(guide.axis === 'x'
                        ? {
                            left: guide.position * zoom,
                            top: guide.from * zoom,
                            width: 1,
                            height: Math.max(1, (guide.to - guide.from) * zoom),
                          }
                        : {
                            top: guide.position * zoom,
                            left: guide.from * zoom,
                            height: 1,
                            width: Math.max(1, (guide.to - guide.from) * zoom),
                          }),
                      background: '#db2777',
                      pointerEvents: 'none',
                      opacity: guidesFading ? 0 : 0.95,
                      transition: 'opacity 75ms ease-out',
                    }}
                  >
                    {guide.label && (
                      <span
                        className="absolute whitespace-nowrap rounded bg-pink-600 px-1 py-0.5 text-[10px] text-white shadow-sm"
                        style={{ left: 4, top: 4 }}
                      >
                        {guide.label}
                      </span>
                    )}
                  </div>
                ))}
            </section>
          )
        })}
      </div>
      {(!gesture || (gesture.kind === 'move' && !gesture.activated)) &&
        !editingText &&
        primary &&
        primary.kind !== 'text' &&
        primary.kind !== 'shape' && (
          <ContextToolbar
            bounds={primaryViewportRect(primary.id)}
            viewport={hostRef.current?.getBoundingClientRect()}
            actions={toolbarActions}
            more={moreItems}
            topClearance={canRotate(primary) ? 40 : 0}
          />
        )}
      {portalHost &&
        createPortal(
          <div
            data-v5-zoom-controls
            data-v5-editor-chrome
            onPointerDown={(event) => event.stopPropagation()}
            className="pointer-events-auto z-10 flex items-center gap-0.5 rounded-lg border border-border/80 bg-background/95 p-1 text-xs shadow-lg backdrop-blur"
            style={(() => {
              const rect = hostRef.current?.getBoundingClientRect()
              return {
                position: 'fixed',
                right: rect ? Math.max(12, window.innerWidth - rect.right + 12) : 12,
                bottom: rect ? Math.max(12, window.innerHeight - rect.bottom + 12) : 12,
              } as CSSProperties
            })()}
          >
            <button
              type="button"
              aria-label="Zoom out"
              className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
              onClick={() => zoomByCommand(zoom / 1.2)}
            >
              −
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-7 min-w-14 rounded px-2 text-center tabular-nums hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Zoom ${Math.round((zoom / 0.01) * 100)} percent. Open zoom options`}
                >
                  <span aria-live="polite">{Math.round((zoom / 0.01) * 100)}%</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                data-v5-zoom-controls
                align="end"
                side="top"
                collisionPadding={12}
              >
                <DropdownMenuItem onSelect={() => zoomByCommand(zoom * 1.2)}>
                  Zoom in <span className="ml-auto pl-6 text-muted-foreground">⌘+</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => zoomByCommand(zoom / 1.2)}>
                  Zoom out <span className="ml-auto pl-6 text-muted-foreground">⌘−</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => zoomByCommand(0.01)}>
                  Actual size <span className="ml-auto pl-6 text-muted-foreground">100%</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => fitView('page')}>Fit page</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => fitView('width')}>Fit width</DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!selectedNodes.length}
                  onSelect={() => fitView('selection')}
                >
                  Fit selection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              aria-label="Zoom in"
              className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
              onClick={() => zoomByCommand(zoom * 1.2)}
            >
              +
            </button>
          </div>,
          portalHost,
        )}
      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Delete{' '}
              {confirmDelete && confirmDelete.length > 1
                ? `${confirmDelete.length} objects`
                : 'object'}
              ?
            </DialogTitle>
            <DialogDescription>
              {confirmDelete?.length === 1 &&
                (() => {
                  const target = allScopeNodes.find((node) => node.id === confirmDelete[0])
                  const descendants = target?.children ? flattenNodes(target.children).length : 0
                  return descendants
                    ? `This also removes ${descendants} grouped ${descendants === 1 ? 'child' : 'children'}. `
                    : ''
                })()}
              This action can be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="h-9 rounded-md border px-3 text-sm hover:bg-accent"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              className="h-9 rounded-md bg-destructive px-3 text-sm text-destructive-foreground"
              onClick={() => {
                if (!confirmDelete) return
                try {
                  session.execute(deleteNodes(confirmDelete))
                } catch (error) {
                  setFeedback({
                    message: error instanceof Error ? error.message : 'Delete failed.',
                    tone: 'error',
                  })
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(confirmTableAction)}
        onOpenChange={(open) => !open && setConfirmTableAction(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete populated table content?</DialogTitle>
            <DialogDescription>{confirmTableAction?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="h-9 rounded-md border px-3 text-sm hover:bg-accent"
              onClick={() => setConfirmTableAction(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              className="h-9 rounded-md bg-destructive px-3 text-sm text-destructive-foreground"
              onClick={() => {
                confirmTableAction?.run()
                setConfirmTableAction(null)
              }}
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {libraryDrag && !libraryDragPageId && (
        <div
          role="status"
          className="pointer-events-none fixed z-50 rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground shadow-sm"
          style={{ left: libraryDrag.clientX + 14, top: libraryDrag.clientY + 50 }}
        >
          Drop on a page
        </div>
      )}
      {feedback && (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-none fixed z-50 max-w-64 rounded-md px-2 py-1 text-xs shadow-lg ${
            feedback.tone === 'error'
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-foreground text-background'
          }`}
          style={{
            left: feedback.clientX ?? 72,
            top: feedback.clientY ?? 72,
          }}
        >
          {feedback.message}
        </div>
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

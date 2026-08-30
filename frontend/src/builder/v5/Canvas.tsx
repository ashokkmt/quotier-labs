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
  Bold,
  Copy,
  Group,
  Image as ImageIcon,
  Pencil,
  Settings2,
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
  updateNodeProps,
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
  geometryMatrix,
  geometryPositionFromMatrix,
  identity,
  multiply,
  type Bounds,
  type Point,
} from './geometry'
import { HoverOutline, MemberSelectionOutline, SelectionOverlay } from './SelectionOverlay'
import { useV5Session } from './store'
import {
  V5_COLOR_HEX,
  defaultShapeProps,
  defaultTextProps,
  V5_TOOL_PRESETS,
  type V5ToolPreset,
  type V5ShapeProps,
  type V5TextProps,
} from './tokens'
import { readValidatedImage } from './imageAssets'
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
import { snapRect, snapResize, type SnapGuide, type SnapRect } from './snapping'
import { du, type V5Geometry, type V5Node, type V5Story } from './model'
import { ContextToolbar, type ToolbarAction } from './ContextToolbar'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { getV5Widget } from './registry'
import { useV5EditorUI } from './EditorUIState'
import { anchorAt, contentPointForAnchor, layoutPageStack } from './pageStack'
import {
  createBlankTable,
  DU_PER_MM,
  normalizeTableData,
  TABLE_MIN_COLUMN_WIDTH_MM,
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
  const fill =
    props.fill && props.fill !== 'none'
      ? V5_COLOR_HEX[props.fill as keyof typeof V5_COLOR_HEX]
      : 'transparent'
  const stroke =
    props.stroke && props.stroke !== 'none'
      ? V5_COLOR_HEX[props.stroke as keyof typeof V5_COLOR_HEX]
      : 'transparent'
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
        : { border: `${ptToPx(widthPt, zoom)}px ${style} ${stroke}` }),
  }
}

function renderText(node: V5Node, zoom: number) {
  const props = node.props as unknown as V5TextProps
  const color =
    V5_COLOR_HEX[(props.color ?? 'black') as keyof typeof V5_COLOR_HEX] ?? V5_COLOR_HEX.black
  return (
    <span
      style={{
        display: 'block',
        color,
        fontSize: ptToPx(Number(props.fontSize ?? 11), zoom),
        fontWeight: props.bold ? 700 : 400,
        textAlign: (props.align ?? 'left') as 'left' | 'center' | 'right',
        whiteSpace: 'pre-wrap',
        overflow: 'hidden',
        width: '100%',
        pointerEvents: 'none',
      }}
    >
      {String(props.text ?? '')}
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
  preview?: { x: number; y: number; rotation?: number }
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
        width: g.width * zoom,
        height: g.height * zoom,
        transform: `rotate(${rotation / 100}deg)`,
        cursor: interactive ? (locked ? 'not-allowed' : 'move') : 'default',
        userSelect: 'none',
      }}
    >
      {editing ? null : node.kind === 'text' ? (
        renderText(node, zoom)
      ) : node.kind === 'shape' ? (
        <div
          aria-hidden="true"
          style={{ width: '100%', height: '100%', ...shapeStyle(node, zoom) }}
        />
      ) : node.kind === 'table' || node.role === 'flow-frame' ? (
        <FlowFrameContent story={stories.find((story) => story.id === node.story_id)} zoom={zoom} />
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
              objectFit: 'cover',
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

function FlowFrameContent({ story, zoom }: { story?: V5Story; zoom: number }) {
  if (!story) return null
  if (story.kind === 'rich-text') {
    const value = typeof story.content === 'string' ? story.content : ''
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
  const table = normalizeTableData(story.content)
  const headers = table.headers
  const rows = table.rows
  const columns = table.column_count
  const cellBorder = `${Math.max(0.5, zoom * 50)}px solid #d1d5db`
  const cells = [...(table.header_enabled ? [headers] : []), ...rows]
  const rowHeight = table.row_height_mm * DU_PER_MM * zoom
  const hasWidths = table.column_widths.every((width) => width > 0)
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: hasWidths
          ? table.column_widths.map((width) => `${width * zoom}px`).join(' ')
          : `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: `${rowHeight}px`,
        width: '100%',
        fontSize: ptToPx(8, zoom),
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {cells.flatMap((row, rowIndex) =>
        Array.from({ length: columns }, (_, columnIndex) => (
          <span
            key={`${rowIndex}-${columnIndex}`}
            style={{
              minWidth: 0,
              padding: `${ptToPx(2, zoom)}px ${ptToPx(3, zoom)}px`,
              borderRight: cellBorder,
              borderBottom: cellBorder,
              borderTop: rowIndex === 0 ? cellBorder : undefined,
              borderLeft: columnIndex === 0 ? cellBorder : undefined,
              background: table.header_enabled && rowIndex === 0 ? '#f3f4f6' : 'transparent',
              fontWeight: table.header_enabled && rowIndex === 0 ? 600 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'pre-wrap',
            }}
          >
            {row[columnIndex] ?? ''}
          </span>
        )),
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
}: {
  node: V5Node
  story: V5Story
  zoom: number
  onUpdate: (table: ReturnType<typeof normalizeTableData>) => void
  onExit: () => void
}) {
  const table = normalizeTableData(story.content)
  const cells = [
    ...(table.header_enabled ? [{ header: true, values: table.headers }] : []),
    ...table.rows.map((values) => ({ header: false, values })),
  ]
  const rowHeight = table.row_height_mm * DU_PER_MM * zoom
  return (
    <div
      data-v5-table-editor
      style={{
        position: 'absolute',
        left: node.geometry.x * zoom,
        top: node.geometry.y * zoom,
        width: node.geometry.width * zoom,
        height: node.geometry.height * zoom,
        display: 'grid',
        gridTemplateColumns: `repeat(${table.column_count}, minmax(0, 1fr))`,
        gridAutoRows: rowHeight,
        transform: node.geometry.rotation
          ? `rotate(${node.geometry.rotation / 100}deg)`
          : undefined,
        transformOrigin: 'center',
        zIndex: 8,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onExit()
        }
      }}
    >
      {cells.flatMap((row, rowIndex) =>
        Array.from({ length: table.column_count }, (_, columnIndex) => (
          <input
            key={`${rowIndex}-${columnIndex}`}
            aria-label={`${row.header ? 'Header' : `Row ${rowIndex - (table.header_enabled ? 1 : 0) + 1}`}, column ${columnIndex + 1}`}
            autoFocus={rowIndex === 0 && columnIndex === 0}
            value={row.values[columnIndex] ?? ''}
            className={`min-w-0 border-b border-r border-gray-300 bg-white px-1 outline-none focus:z-10 focus:ring-2 focus:ring-primary ${row.header ? 'font-semibold bg-gray-50' : ''}`}
            style={{ fontSize: ptToPx(8, zoom) }}
            onChange={(event) => {
              const value = event.target.value
              if (row.header) table.headers[columnIndex] = value
              else table.rows[rowIndex - (table.header_enabled ? 1 : 0)][columnIndex] = value
              onUpdate(table)
            }}
          />
        )),
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
  onAutoHeight,
}: {
  node: V5Node
  geometry: V5Geometry
  zoom: number
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  onAutoHeight: (heightPx: number) => void
}) {
  const props = node.props as unknown as V5TextProps
  const color =
    V5_COLOR_HEX[(props.color ?? 'black') as keyof typeof V5_COLOR_HEX] ?? V5_COLOR_HEX.black
  const ref = useRef<HTMLTextAreaElement>(null)
  const [composing, setComposing] = useState(false)
  const measureContentHeight = () => {
    const element = ref.current
    if (!element) return null
    const renderedHeight = element.style.height
    // Measure the glyph content, not the authored box. Measuring scrollHeight while the
    // textarea is set to the current intrinsic height makes every pass grow by its padding.
    element.style.height = '1px'
    const measured = element.scrollHeight
    element.style.height = renderedHeight
    return measured
  }
  // Canva-style intrinsic growth: the box follows the typed content every keystroke.
  useLayoutEffect(() => {
    if (composing) return
    const height = measureContentHeight()
    if (height !== null) onAutoHeight(height)
    // measureContentHeight is intentionally local to the mounted textarea; only text/style
    // changes should trigger a fresh document measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, composing, onAutoHeight])
  return (
    <textarea
      ref={ref}
      aria-label="Edit text"
      data-v5-text-editor
      autoFocus
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onChange(event.target.value)}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => {
        setComposing(false)
        const height = measureContentHeight()
        if (height !== null) onAutoHeight(height)
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
        fontWeight: props.bold ? 700 : 400,
        textAlign: (props.align ?? 'left') as 'left' | 'center' | 'right',
        color,
        // The editing surface occupies the same geometry as the printed text. Editor chrome
        // is intentionally transparent so the user never switches to a form-like editor.
        background: 'transparent',
        border: '1.5px solid #2563eb',
        padding: 0,
        margin: 0,
        resize: 'none',
        outline: 'none',
        fontFamily: 'inherit',
        lineHeight: 1.2,
        transform: geometry.rotation ? `rotate(${geometry.rotation / 100}deg)` : undefined,
        transformOrigin: 'center',
      }}
    />
  )
}

function TextFormattingStrip({
  node,
  viewport,
  onUpdate,
  onOpenInspector,
}: {
  node: V5Node
  viewport?: DOMRect | null
  onUpdate: (patch: Partial<V5TextProps>) => void
  onOpenInspector: () => void
}) {
  const props = node.props as unknown as V5TextProps
  const alignments = [
    { value: 'left' as const, label: 'Align left', Icon: AlignLeft },
    { value: 'center' as const, label: 'Align center', Icon: AlignCenter },
    { value: 'right' as const, label: 'Align right', Icon: AlignRight },
  ]
  return (
    <div
      data-v5-text-formatting
      data-v5-editor-chrome
      role="toolbar"
      aria-label="Text formatting"
      className="pointer-events-auto z-30 flex h-10 items-center gap-1 rounded-lg border border-border/80 bg-background/95 p-1 shadow-lg backdrop-blur"
      style={{
        position: 'fixed',
        left: viewport ? viewport.left + viewport.width / 2 : -9999,
        top: viewport ? viewport.top + 12 : -9999,
        transform: 'translateX(-50%)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="px-2 text-xs text-muted-foreground">Document font</span>
      <input
        aria-label="Font size in points"
        className="h-7 w-14 rounded border bg-background px-1 text-center text-xs tabular-nums"
        type="number"
        min={6}
        max={72}
        value={Number(props.fontSize ?? 11)}
        onChange={(event) =>
          onUpdate({ fontSize: Math.min(72, Math.max(6, Number(event.target.value) || 11)) })
        }
      />
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={Boolean(props.bold)}
        className={`grid h-7 w-7 place-items-center rounded ${props.bold ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onUpdate({ bold: !props.bold })}
      >
        <Bold className="h-4 w-4" />
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Text color: ${props.color ?? 'black'}`}
            className="flex h-7 items-center gap-1.5 rounded border bg-background px-2 text-xs capitalize hover:bg-accent"
            onPointerDown={(event) => event.preventDefault()}
          >
            <span
              aria-hidden
              className="h-3 w-3 rounded-full border"
              style={{ background: V5_COLOR_HEX[props.color ?? 'black'] }}
            />
            {props.color ?? 'black'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-v5-editor-chrome align="center">
          {Object.keys(V5_COLOR_HEX).map((color) => (
            <DropdownMenuItem
              key={color}
              className="capitalize"
              onSelect={() => onUpdate({ color: color as V5TextProps['color'] })}
            >
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border"
                style={{ background: V5_COLOR_HEX[color as keyof typeof V5_COLOR_HEX] }}
              />
              {color}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        aria-label="More text properties"
        className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
        onPointerDown={(event) => event.preventDefault()}
        onClick={onOpenInspector}
      >
        <Settings2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function containsPoint(rect: Bounds, corners_: Point[]): boolean {
  return corners_.every(
    (point) =>
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height,
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
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [preview, setPreview] = useState<
    Record<string, { x: number; y: number; rotation?: number; width?: number; height?: number }>
  >({})
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [editingText, setEditingText] = useState<{
    id: string
    value: string
    initial: string
  } | null>(null)
  const [editingTableId, setEditingTableId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const [badge, setBadge] = useState<string | null>(null)
  const [panMode, setPanMode] = useState(false)
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
            containsPoint(marqueeRect, nodeProjection(node).points),
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

  const handleTextAutoHeight = (nodeId: string, heightPx: number) => {
    const node = allScopeNodes.find((candidate) => candidate.id === nodeId)
    if (!node || node.layout_mode !== 'intrinsic') return
    const next = du(heightPx / zoom)
    if (Math.abs(next - node.geometry.height) <= 1) return
    // Coalesced by the command key, so a typing burst is one history entry.
    try {
      session.execute(updateNodeGeometry(nodeId, { ...node.geometry, height: next }))
    } catch (error) {
      reportError(error, 'Text could not be resized.')
    }
  }

  const startTextEditing = (node: V5Node) => {
    if (node.kind !== 'text' || isEffectivelyLocked(document, node.id)) return
    setGesture(null)
    setPreview({})
    setGuides([])
    setEditingText({
      id: node.id,
      value: String(node.props?.text ?? ''),
      initial: String(node.props?.text ?? ''),
    })
    setHoverId(null)
  }

  const commitTextEditing = (revert = false) => {
    if (!editingText) return
    const { id, value, initial } = editingText
    setEditingText(null)
    if (revert || value === initial) return
    try {
      session.execute(updateNodeProps(id, { text: value }))
    } catch (error) {
      reportError(error, 'Text could not be updated.')
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
    const rect: Bounds = isDrag
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
          props: { ...defaultTextProps(), text: 'Text' },
        }),
      )
      session.selectNode(nodeId)
      session.setTool('select')
      setEditingText({ id: nodeId, value: 'Text', initial: 'Text' })
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
  ): string | null => {
    const page = pages.find((candidate) => candidate.id === pageId)
    if (!page) return null
    const geometry = {
      x: du(Math.max(0, Math.min(at.x - preset.size.width / 2, page.width - preset.size.width))),
      y: du(Math.max(0, Math.min(at.y - preset.size.height / 2, page.height - preset.size.height))),
      width: preset.size.width,
      height: preset.size.height,
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
        setEditingText({ id: nodeId, value, initial: value })
      }
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
      insertPresetAt(preset, pageId, point, undefined, {
        rows: presetInsertRequest.tableRows ?? 2,
        columns: presetInsertRequest.tableColumns ?? 2,
      })
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
      text: { width: 22000, height: 3000 },
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
    event.stopPropagation()
    if (editingTableId && editingTableId !== node.id) setEditingTableId(null)
    const additive = event.shiftKey
    const cycling = event.metaKey || event.ctrlKey
    if (isEffectivelyLocked(document, node.id)) {
      // Locked objects are skipped by interaction; a click shows restricted selection via Layers only.
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
    if (!toggleOnClick) session.selectNode(node.id, additive)
    const ids = additive
      ? alreadySelected
        ? session.selectedNodeIds
        : [...session.selectedNodeIds, node.id]
      : alreadySelected
        ? session.selectedNodeIds
        : [node.id]
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
    event.stopPropagation()
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
    event.stopPropagation()
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
      const finalGeometry = snap ? snap.rect : nextGeometry
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
        // Full containment of every transformed corner (tools.md §8).
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
        const finalGeometry = snap ? snap.rect : nextGeometry
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
          session.execute(
            updateNodeGeometry(gesture.id, {
              x: finalGeometry.x,
              y: finalGeometry.y,
              width: finalGeometry.width,
              height: finalGeometry.height,
              rotation: gesture.geometry.rotation,
            }),
          )
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
    setGuides([])
    setBadge(null)
    snapActiveRef.current = false
  }

  const cancelGesture = () => {
    setGesture(null)
    setPreview({})
    setGuides([])
    setBadge(null)
    setMarquee(null)
    snapActiveRef.current = false
  }

  // --- keyboard contract (tools.md §35); inputs and text editing own their keys -----------

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
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
      try {
        session.execute(nudgeNodes(session.selectedNodeIds, dx, dy))
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
          run: () => setEditingTableId(primary.id),
        })
        const story = primary.story_id
          ? document.stories?.find((candidate) => candidate.id === primary.story_id)
          : null
        if (story?.kind === 'table') {
          actions.push({
            id: 'add-row',
            label: 'Add row',
            run: () => {
              const table = normalizeTableData(story.content)
              table.rows.push(Array.from({ length: table.column_count }, () => ''))
              session.execute(updateTableContent(primary.id, table))
            },
          })
          actions.push({
            id: 'add-column',
            label: 'Add column',
            run: () => {
              const table = normalizeTableData(story.content)
              if (table.column_count >= 12) return
              table.column_count += 1
              table.headers.push('')
              table.rows = table.rows.map((row) => [...row, ''])
              table.column_widths = Array.from({ length: table.column_count }, () =>
                du(primary.geometry.width / table.column_count),
              )
              session.execute(updateTableContent(primary.id, table))
            },
          })
        }
      } else
        actions.push({
          id: 'edit',
          label: 'Edit properties',
          icon: Pencil,
          run: () => setInspectorOpen(true),
        })
    }
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
  }, [primary, selectedNodes.length, selectionLocked])

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
                return [
                  ...(table.rows.length > 1
                    ? [
                        {
                          label: 'Remove last row',
                          destructive: table.rows.at(-1)?.some(Boolean),
                          run: () => {
                            const next = normalizeTableData(story.content)
                            next.rows = next.rows.slice(0, -1)
                            session.execute(updateTableContent(primary.id, next))
                          },
                        },
                      ]
                    : []),
                  ...(table.column_count > 1
                    ? [
                        {
                          label: 'Remove last column',
                          destructive: [
                            ...table.headers,
                            ...table.rows.map((row) => row.at(-1)),
                          ].some(Boolean),
                          run: () => {
                            const next = normalizeTableData(story.content)
                            next.column_count -= 1
                            next.headers = next.headers.slice(0, -1)
                            next.rows = next.rows.map((row) => row.slice(0, -1))
                            next.column_widths = next.column_widths.slice(0, -1)
                            session.execute(updateTableContent(primary.id, next))
                          },
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
    const items: MenuItem[] = []
    if (node || session.selectedNodeIds.length) {
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
        { label: 'Duplicate', shortcut: '⌘D', run: performDuplicate },
        {
          label: 'Order',
          menu: [
            { label: 'Bring forward', run: () => shiftOrder(1) },
            { label: 'Send backward', run: () => shiftOrder(-1) },
            {
              label: 'Bring to front',
              run: () => primary && session.execute(reorderExtreme(primary.id, 'front')),
            },
            {
              label: 'Send to back',
              run: () => primary && session.execute(reorderExtreme(primary.id, 'back')),
            },
          ],
        },
        {
          label: primary?.role === 'group' ? 'Ungroup' : 'Group',
          run: primary?.role === 'group' ? performUngroup : performGroup,
        },
        { label: 'Delete', destructive: true, run: () => requestDelete(session.selectedNodeIds) },
      )
    }
    if (session.clipboardCount > 0)
      items.splice(node ? 2 : 0, 0, {
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
      setFeedback({
        message: error instanceof Error ? error.message : 'The image could not be inserted.',
        tone: 'error',
        clientX: client.x,
        clientY: client.y,
      })
    }
  }
  const portalHost = hostRef.current?.ownerDocument.body

  return (
    <div
      ref={hostRef}
      data-v5-canvas
      tabIndex={0}
      className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-slate-200 outline-none"
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
        const preset = V5_TOOL_PRESETS.find((candidate) => candidate.id === 'text')
        if (!preset) return
        const id = insertPresetAt(preset, activePage.id, point, { text: plainText })
        if (id) setEditingText({ id, value: plainText, initial: plainText })
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
      {editingText &&
        (() => {
          const target = allScopeNodes.find((node) => node.id === editingText.id)
          return target ? (
            <TextFormattingStrip
              node={target}
              viewport={hostRef.current?.getBoundingClientRect()}
              onUpdate={(patch) => session.execute(updateNodeProps(target.id, patch))}
              onOpenInspector={() => setInspectorOpen(true)}
            />
          ) : null
        })()}
      <div
        className="relative bg-slate-200"
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
                if (editingTableId) setEditingTableId(null)
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
                    editing={editingText?.id === node.id || editingTableId === node.id}
                    onPointerDown={beginMove}
                    onDoubleClick={(target) => {
                      if (target.role === 'group') session.enterGroup(target.id)
                      else if (target.kind === 'text') startTextEditing(target)
                      else if (
                        target.story_id &&
                        document.stories?.find((story) => story.id === target.story_id)?.kind ===
                          'table'
                      )
                        setEditingTableId(target.id)
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
                  return tableNode && tableStory?.kind === 'table' ? (
                    <TableEditor
                      node={tableNode}
                      story={tableStory}
                      zoom={zoom}
                      onUpdate={(table) => session.execute(updateTableContent(tableNode.id, table))}
                      onExit={() => setEditingTableId(null)}
                    />
                  ) : null
                })()}
              {editingText && isActive && (
                <TextEditor
                  node={allScopeNodes.find((candidate) => candidate.id === editingText.id)!}
                  geometry={(() => {
                    const edited = allScopeNodes.find(
                      (candidate) => candidate.id === editingText.id,
                    )!
                    const projection = nodeProjection(edited)
                    return {
                      x: projection.origin.x,
                      y: projection.origin.y,
                      width: projection.width,
                      height: projection.height,
                      rotation: projection.rotation,
                    }
                  })()}
                  zoom={zoom}
                  value={editingText.value}
                  onChange={(value) => setEditingText({ ...editingText, value })}
                  onCommit={() => commitTextEditing(false)}
                  onCancel={() => commitTextEditing(true)}
                  onAutoHeight={(heightPx) => handleTextAutoHeight(editingText.id, heightPx)}
                />
              )}
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
                  measurement={
                    selectionLocked
                      ? { label: 'Locked', placement: 'bottom' }
                      : badge
                        ? { label: badge, placement: 'bottom' }
                        : null
                  }
                />
              )}
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
                      opacity: 0.95,
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
      {(!gesture || (gesture.kind === 'move' && !gesture.activated)) && !editingText && primary && (
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
            className="pointer-events-auto z-50 flex items-center gap-0.5 rounded-lg border border-border/80 bg-background/95 p-1 text-xs shadow-lg backdrop-blur"
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

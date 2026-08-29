import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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
  resizeNode,
  rotateNode,
  setNodeLocked,
  setNodeVisibility,
  ungroupNode,
  updateNodeGeometry,
  updateNodeProps,
  alignNodes,
  alignToPage,
  distributeNodes,
  type ResizeHandle,
} from './commands'
import { corners, type Bounds, type Point } from './geometry'
import { SelectionOverlay } from './SelectionOverlay'
import { useV5Session } from './store'
import {
  V5_COLOR_HEX,
  defaultShapeProps,
  defaultTextProps,
  type V5ShapeProps,
  type V5TextProps,
} from './tokens'
import { createStory } from './stories'
import { findNode, flattenNodes, isEffectivelyHidden, isEffectivelyLocked } from './selectors'
import type { V5Tool } from './store'
import { snapRect, snapResize, type SnapRect } from './snapping'
import { du, type V5Geometry, type V5Node } from './model'
import { ContextToolbar, type ToolbarAction } from './ContextToolbar'
import { ContextMenu, type MenuItem } from './ContextMenu'

const GAP = 48
const MOVE_THRESHOLD_PX = 4
const SNAP_SCREEN_PX = 6

type Gesture =
  | {
      kind: 'move'
      ids: string[]
      pageId: string
      startClient: Point
      base: Map<string, Point>
      duplicate: boolean
    }
  | { kind: 'resize'; id: string; handle: ResizeHandle; startClient: Point; geometry: V5Geometry }
  | { kind: 'rotate'; id: string; geometry: V5Geometry }
  | { kind: 'pan'; startClient: Point; startScroll: Point }
  | { kind: 'place'; pageId: string; startDoc: Point; currentDoc: Point }

type Marquee = {
  pageId: string
  startDoc: Point
  currentDoc: Point
  additive: boolean
  base: string[]
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
  isSelected,
  isHovered,
  isCandidate,
  preview,
  editing,
  onPointerDown,
  onDoubleClick,
}: {
  node: V5Node
  zoom: number
  isSelected: boolean
  isHovered: boolean
  isCandidate?: boolean
  preview?: { x: number; y: number; rotation?: number }
  editing?: boolean
  onPointerDown: (node: V5Node, event: ReactPointerEvent<HTMLDivElement>) => void
  onDoubleClick: (node: V5Node) => void
}) {
  const g = node.geometry
  const x = preview?.x ?? g.x
  const y = preview?.y ?? g.y
  const rotation = preview?.rotation ?? g.rotation
  const locked = node.locked
  const chrome = isSelected
    ? { outline: '1.5px solid #2563eb', outlineOffset: 0 }
    : isCandidate
      ? { outline: '1px solid #93c5fd' }
      : isHovered
        ? { outline: '1px solid #93c5fd99' }
        : { outline: '1px solid transparent' }
  return (
    <div
      data-v5-node-id={node.id}
      role="button"
      tabIndex={-1}
      aria-label={node.name ?? node.kind}
      aria-pressed={isSelected}
      onPointerDown={(event) => onPointerDown(node, event)}
      onDoubleClick={() => onDoubleClick(node)}
      style={{
        position: 'absolute',
        left: x * zoom,
        top: y * zoom,
        width: g.width * zoom,
        height: g.height * zoom,
        transform: `rotate(${rotation / 100}deg)`,
        opacity: locked ? 0.85 : 1,
        cursor: locked ? 'not-allowed' : 'move',
        userSelect: 'none',
        ...chrome,
      }}
    >
      {editing ? null : node.kind === 'text' ? (
        renderText(node, zoom)
      ) : node.kind === 'shape' ? (
        <div
          aria-hidden="true"
          style={{ width: '100%', height: '100%', ...shapeStyle(node, zoom) }}
        />
      ) : node.kind === 'table' ? (
        'Table'
      ) : node.kind === 'image' ? (
        node.props?.source ? null : (
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
      ) : node.role === 'flow-frame' ? (
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '100%',
            color: '#9ca3af',
            border: '1px dashed #cbd5e1',
            pointerEvents: 'none',
          }}
        >
          Flow
        </span>
      ) : null}
      {node.children?.map((child) => (
        <NodeView
          key={child.id}
          node={child}
          zoom={zoom}
          isSelected={isSelected}
          isHovered={isHovered}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        />
      ))}
    </div>
  )
}

function TextEditor({
  node,
  zoom,
  value,
  onChange,
  onCommit,
  onCancel,
  onAutoHeight,
}: {
  node: V5Node
  zoom: number
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  onAutoHeight: (heightPx: number) => void
}) {
  const props = node.props as unknown as V5TextProps
  const color = V5_COLOR_HEX[(props.color ?? 'black') as keyof typeof V5_COLOR_HEX] ?? V5_COLOR_HEX.black
  const ref = useRef<HTMLTextAreaElement>(null)
  // Canva-style intrinsic growth: the box follows the typed content every keystroke.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    onAutoHeight(element.scrollHeight + 4)
  }, [value, onAutoHeight])
  return (
    <textarea
      ref={ref}
      aria-label="Edit text"
      data-v5-text-editor
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        event.stopPropagation()
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
        left: node.geometry.x * zoom,
        top: node.geometry.y * zoom,
        width: node.geometry.width * zoom,
        height: node.geometry.height * zoom,
        fontSize: ptToPx(Number(props.fontSize ?? 11), zoom),
        fontWeight: props.bold ? 700 : 400,
        textAlign: (props.align ?? 'left') as 'left' | 'center' | 'right',
        color,
        background: 'white',
        border: '1.5px solid #2563eb',
        padding: 0,
        margin: 0,
        resize: 'none',
        outline: 'none',
        fontFamily: 'inherit',
      }}
    />
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
  const hostRef = useRef<HTMLDivElement>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [preview, setPreview] = useState<
    Record<string, { x: number; y: number; rotation?: number; width?: number; height?: number }>
  >({})
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [editingText, setEditingText] = useState<{
    id: string
    value: string
    initial: string
  } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const [badge, setBadge] = useState<string | null>(null)
  const [panMode, setPanMode] = useState(false)
  const zoom = session.zoom

  const document = session.document
  const pages = document.root.pages
  const pageOffsets = useMemo(() => {
    let y = 0
    return pages.map((page) => {
      const offset = { x: GAP, y: y + GAP }
      y += GAP * 2 + page.height * zoom
      return offset
    })
  }, [pages, zoom])
  const contentSize = useMemo(() => {
    const last = pages.length - 1
    return {
      width: GAP * 2 + pages[0].width * zoom,
      height: pageOffsets[last]?.y + pages[last].height * zoom + GAP,
    }
  }, [pages, pageOffsets, zoom])

  const activePage = pages.find((page) => page.id === session.activePageId) ?? pages[0]

  const scopeChildren = useMemo(() => {
    if (!session.editScopeId) return activePage.children
    return (
      flattenNodes(activePage.children).find((node) => node.id === session.editScopeId)?.children ??
      []
    )
  }, [activePage, session.editScopeId])
  const allScopeNodes = useMemo(() => flattenNodes(scopeChildren), [scopeChildren])
  const visibleScopeNodes = allScopeNodes.filter((node) => !isEffectivelyHidden(document, node.id))
  const selectedNodes = visibleScopeNodes.filter((node) =>
    session.selectedNodeIds.includes(node.id),
  )
  const primary = selectedNodes.at(-1) ?? null


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
    for (const node of page.children) {
      if (movingIds.includes(node.id)) continue
      if (isEffectivelyHidden(document, node.id)) continue
      rects.push({ id: node.id, ...node.geometry })
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
    } catch {
      /* document bounds reject only pathological heights */
    }
  }

  const startTextEditing = (node: V5Node) => {
    if (node.kind !== 'text' || isEffectivelyLocked(document, node.id)) return
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
    } catch {
      /* validation failure keeps the document unchanged */
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
    } catch {
      /* invalid selection stays unchanged */
    }
  }
  const performUngroup = () => {
    const node = primary
    if (!node || node.role !== 'group') return
    const children = node.children?.map((child) => child.id) ?? []
    try {
      session.execute(ungroupNode(node.id))
      session.selectNodes(children)
    } catch {
      /* nothing to do */
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
    } catch {
      /* no space or locked; document unchanged */
    }
  }
  const performAlign = (mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => {
    try {
      session.execute(alignNodes(session.selectedNodeIds, mode))
    } catch {
      /* invalid selection */
    }
  }
  const alignSingle = (mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => {
    if (!primary) return
    try {
      session.execute(alignToPage(primary.id, mode))
    } catch {
      /* locked */
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
    return { left: rect.x * zoom, top: rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom }
  }

  const commitPlace = (gesture: Extract<Gesture, { kind: 'place' }>) => {
    const tool = session.tool
    const variant = session.shapeVariant
    const page = pages.find((candidate) => candidate.id === gesture.pageId)
    if (!page) return
    const dragged = placeRect(gesture)
    const threshold = MOVE_THRESHOLD_PX / zoom
    const isDrag = dragged.width * zoom > MOVE_THRESHOLD_PX || dragged.height * zoom > MOVE_THRESHOLD_PX
    const rect: Bounds = isDrag
      ? variant === 'square'
        ? {
            x: gesture.currentDoc.x >= gesture.startDoc.x ? gesture.startDoc.x : gesture.startDoc.x - Math.max(dragged.width, dragged.height),
            y: gesture.currentDoc.y >= gesture.startDoc.y ? gesture.startDoc.y : gesture.startDoc.y - Math.max(dragged.width, dragged.height),
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
        insertNode(
          page.id,
          {
            id: nodeId,
            kind: 'text',
            role: 'element',
            name: 'Text',
            geometry,
            layout_mode: 'intrinsic',
            locked: false,
            visibility: 'shown',
            optional: false,
            props: { ...defaultTextProps(), text: '' },
          },
        ),
      )
      session.selectNode(nodeId)
      session.setTool('select')
      setEditingText({ id: nodeId, value: '', initial: '' })
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
          createStory(storyId, 'table', {
            headers: ['Item', 'Qty', 'Rate'],
            rows: [
              ['', '', ''],
              ['', '', ''],
              ['', '', ''],
            ],
          }),
        ),
      )
    } else {
      return
    }
    session.selectNode(nodeId)
    session.setTool('select')
    void threshold
  }

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
    return { x: at.x - size.width / 2, y: at.y - size.height / 2, width: size.width, height: size.height }
  }
  const performDistribute = (axis: 'x' | 'y') => {
    try {
      session.execute(distributeNodes(session.selectedNodeIds, axis))
    } catch {
      /* invalid selection */
    }
  }

  const beginMove = (node: V5Node, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
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
    session.selectNode(node.id, additive)
    const ids = additive
      ? session.selectedNodeIds.includes(node.id)
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
      pageId: session.activePageId,
      // Deltas are computed from client pixels converted by zoom; storing the doc point here
      // would mix units and fling objects to the page origin.
      startClient: clientPoint(event),
      base: new Map(
        ids.map((id) => {
          const target = allScopeNodes.find((candidate) => candidate.id === id)!
          return [id, { x: target.geometry.x, y: target.geometry.y }]
        }),
      ),
      duplicate: event.altKey,
    })
  }

  const uniqueNodeIdsFromElements = (elements: HTMLElement[]): string[] => {
    const ids: string[] = []
    for (const element of elements) {
      const id = element.getAttribute?.('data-v5-node-id')
      if (id && !ids.includes(id)) ids.push(id)
    }
    return ids.filter((id) => !isEffectivelyHidden(document, id))
  }

  const beginResize = (handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const node = primary
    if (!node || node.role === 'group') return
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({ kind: 'resize', id: node.id, handle, startClient: clientPoint(event), geometry: node.geometry })
  }
  const beginRotate = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const node = primary
    if (!node) return
    if (node.role === 'flow-frame') return
    if (node.role === 'element' && !canRotate(node)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({ kind: 'rotate', id: node.id, geometry: node.geometry })
  }

  const canRotate = (node: V5Node): boolean => {
    if (node.role === 'flow-frame') return false
    if (node.role === 'group')
      return flattenNodes([node]).every((child) => child.role === 'group' || canRotate(child))
    return node.kind === 'shape' || node.kind === 'image' || node.kind === 'text'
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
    if (marquee) {
      setMarquee({ ...marquee, currentDoc: docPointFromClient(point.x, point.y, marquee.pageId) })
      return
    }
    if (!gesture) {
      // Hover identification follows the topmost element under the pointer.
      const target = event.target as HTMLElement
      const id = target.closest?.('[data-v5-node-id]')?.getAttribute('data-v5-node-id') ?? null
      setHoverId(id && id !== session.selectedNodeId ? id : null)
      return
    }
    if (gesture.kind === 'place') {
      // Placement tools drag a ghost rect in document space.
      setGesture({ ...gesture, currentDoc: docPointFromClient(point.x, point.y, gesture.pageId) })
      return
    }
    // Pointer deltas: client pixels → document units. startClient keeps the units consistent.
    const dx = gesture.kind === 'move' || gesture.kind === 'resize' ? (point.x - gesture.startClient.x) / zoom : 0
    const dy = gesture.kind === 'move' || gesture.kind === 'resize' ? (point.y - gesture.startClient.y) / zoom : 0
    if (gesture.kind === 'move') {
      let translateX = dx
      let translateY = dy
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) translateY = 0
        else translateX = 0
      }
      // Clamp the whole union inside the page; margins warn but are not hard bounds.
      const page = pages.find((candidate) => candidate.id === gesture.pageId)!
      const union = unionOfBase(gesture)
      translateX = Math.min(Math.max(translateX, -union.x), page.width - union.x - union.width)
      translateY = Math.min(Math.max(translateY, -union.y), page.height - union.y - union.height)
      const movingRect: SnapRect = {
        id: '__moving__',
        x: union.x + translateX,
        y: union.y + translateY,
        width: union.width,
        height: union.height,
      }
      const threshold = SNAP_SCREEN_PX / zoom
      const snap = event.ctrlKey
        ? { dx: 0, dy: 0 }
        : snapRect(movingRect, snapCandidates(gesture.pageId, gesture.ids), threshold)
      if (snap.xGuide !== undefined || snap.yGuide !== undefined)
        setGuides({ x: snap.xGuide, y: snap.yGuide })
      else setGuides({})
      setPreview(
        Object.fromEntries(
          gesture.ids.map((id) => {
            const base = gesture.base.get(id)!
            return [
              id,
              {
                x: base.x + translateX + (snap.xGuide !== undefined ? snap.dx : 0),
                y: base.y + translateY + (snap.yGuide !== undefined ? snap.dy : 0),
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
      const nextGeometry = resizeGeometry(gesture.geometry, gesture.handle, dx, dy, {
        fromCenter: event.altKey,
        preserveAspect: event.shiftKey,
        minSize: 200,
      })
      const page = pages.find((candidate) => candidate.id === session.activePageId)!
      const edges = {
        left: gesture.handle.includes('w'),
        right: gesture.handle.includes('e'),
        top: gesture.handle.includes('n'),
        bottom: gesture.handle.includes('s'),
      }
      const threshold = SNAP_SCREEN_PX / zoom
      const snap = event.ctrlKey
        ? null
        : snapResize(
            { id: node.id, ...nextGeometry },
            edges,
            snapCandidates(session.activePageId, [node.id]),
            threshold,
          )
      const finalGeometry = snap ? snap.rect : nextGeometry
      setGuides(snap ? { x: snap.xGuide, y: snap.yGuide } : {})
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
      const rect = hostRef.current
        ?.querySelector(`[data-v5-node-id="${node.id}"]`)
        ?.getBoundingClientRect()
      const center = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: point.x, y: point.y }
      const degrees = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90
      const snapped = event.shiftKey ? Math.round(degrees / 15) * 15 : degrees
      setPreview({ [node.id]: { x: node.geometry.x, y: node.geometry.y, rotation: snapped * 100 } })
      setBadge(`${Math.round(snapped)}°`)
    }
  }

  const unionOfBase = (gesture: Extract<Gesture, { kind: 'move' }>): Bounds => {
    const xs: number[] = []
    const ys: number[] = []
    for (const [id, base] of gesture.base) {
      const node = allScopeNodes.find((candidate) => candidate.id === id)!
      xs.push(base.x, base.x + node.geometry.width)
      ys.push(base.y, base.y + node.geometry.height)
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
        const page = pages.find((candidate) => candidate.id === marquee.pageId)!
        const contained = page.children.filter((node) => {
          if (isEffectivelyHidden(document, node.id) || isEffectivelyLocked(document, node.id))
            return false
          return containsPoint(rectInPage, corners(node.geometry))
        })
        const ids = contained.map((node) => node.id)
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
    const dx = gesture.kind === 'move' || gesture.kind === 'resize' ? (point.x - gesture.startClient.x) / zoom : 0
    const dy = gesture.kind === 'move' || gesture.kind === 'resize' ? (point.y - gesture.startClient.y) / zoom : 0
    try {
      if (gesture.kind === 'move') {
        const previewDx = preview[gesture.ids[0]]
          ? preview[gesture.ids[0]].x - gesture.base.get(gesture.ids[0])!.x
          : dx
        const previewDy = preview[gesture.ids[0]]
          ? preview[gesture.ids[0]].y - gesture.base.get(gesture.ids[0])!.y
          : dy
        if (gesture.duplicate) {
          const cloneIds = gesture.ids.map(() => session.nextID('node'))
          let index = 0
          session.execute(
            duplicateAndMove(gesture.ids, previewDx, previewDy, () => cloneIds[index++]),
          )
          session.rememberDuplicateTransform(previewDx, previewDy)
          session.selectNodes(cloneIds)
        } else if (Math.round(previewDx) !== 0 || Math.round(previewDy) !== 0) {
          session.execute(moveNodes(gesture.ids, previewDx, previewDy))
        }
      } else if (gesture.kind === 'resize') {
        // Recompute the final geometry exactly as the preview did so commit is jump-free.
        const node = allScopeNodes.find((candidate) => candidate.id === gesture.id)
        if (!node) return
        const nextGeometry = resizeGeometry(gesture.geometry, gesture.handle, dx, dy, {
          fromCenter: event.altKey,
          preserveAspect: event.shiftKey,
          minSize: 200,
        })
        const edges = {
          left: gesture.handle.includes('w'),
          right: gesture.handle.includes('e'),
          top: gesture.handle.includes('n'),
          bottom: gesture.handle.includes('s'),
        }
        const snap = event.ctrlKey
          ? null
          : snapResize(
              { id: node.id, ...nextGeometry },
              edges,
              snapCandidates(session.activePageId, [node.id]),
              SNAP_SCREEN_PX / zoom,
            )
        const finalGeometry = snap ? snap.rect : nextGeometry
        // Commit through the edge deltas the handle actually moved; resizeGeometry applies
        // dx/dy only to the moving edges, so snap corrections ride along correctly.
        void finalGeometry
        session.execute(
          resizeNode(gesture.id, gesture.handle, dx + (snap?.dx ?? 0), dy + (snap?.dy ?? 0), {
            fromCenter: event.altKey,
            preserveAspect: event.shiftKey,
            minSize: 200,
          }),
        )
      } else if (gesture.kind === 'rotate') {
        const node = allScopeNodes.find((candidate) => candidate.id === gesture.id)
        const rotation = node ? preview[node.id]?.rotation : undefined
        if (rotation !== undefined)
          session.execute(rotateNode(gesture.id, rotation / 100, event.shiftKey))
      }
    } catch {
      /* invalid commits leave the document unchanged */
    }
    setGesture(null)
    setPreview({})
    setGuides({})
    setBadge(null)
  }

  const cancelGesture = () => {
    setGesture(null)
    setPreview({})
    setGuides({})
    setBadge(null)
    setMarquee(null)
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
      const toolKeys: Record<string, { tool: V5Tool; variant?: 'rect' | 'ellipse' | 'line' | 'square' }> = {
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
      session.copySelection()
      return
    }
    if (mod && key.toLowerCase() === 'x') {
      session.cutSelection()
      return
    }
    if (mod && key.toLowerCase() === 'v') {
      event.preventDefault()
      try {
        session.paste(event.shiftKey ? 'in-place' : 'standard')
      } catch (error) {
        setBadge(error instanceof Error ? error.message : 'Paste failed')
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
        const siblings = session.document.root.pages.find(
          (page) => page.id === session.activePageId,
        )!.children
        const index = siblings.findIndex((node) => node.id === id)
        session.execute(reorderNode(id, key === ']' ? index + 1 : index - 1))
      }
      return
    }
    if (mod && (key === '=' || key === '+')) {
      event.preventDefault()
      session.setZoom(zoom * 1.2)
      return
    }
    if (mod && key === '-') {
      event.preventDefault()
      session.setZoom(zoom / 1.2)
      return
    }
    if (mod && key === '0') {
      event.preventDefault()
      session.setZoom(0.01)
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
      } catch {
        /* locked selection cannot nudge */
      }
      return
    }
    if (key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) {
        // Select the parent of the primary selection.
        const chain = ancestorOf(primary?.id)
        const parent = chain.length > 1 ? chain[chain.length - 2] : null
        if (parent) session.selectNode(parent.id)
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
        session.setZoom(session.zoom * factor)
      }
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // --- selection chrome geometry -----------------------------------------------------------

  const singleResizable = selectedNodes.length === 1 && primary && primary.role !== 'group'
  const showHandles = !!singleResizable && !gesture && !editingText

  const toolbarActions: ToolbarAction[] = useMemo(() => {
    if (!primary) return []
    const actions: ToolbarAction[] = []
    if (selectedNodes.length >= 2)
      actions.push({ id: 'group', label: 'Group', shortcut: '⌘G', run: performGroup })
    if (primary.role === 'group')
      actions.push({ id: 'ungroup', label: 'Ungroup', shortcut: '⌘⇧G', run: performUngroup })
    actions.push({ id: 'duplicate', label: 'Duplicate', shortcut: '⌘D', run: performDuplicate })
    actions.push({
      id: 'order',
      label: 'Order',
      menu: [
        { label: 'Bring forward', run: () => shiftOrder(1) },
        { label: 'Send backward', run: () => shiftOrder(-1) },
        {
          label: 'Bring to front',
          run: () => session.execute(reorderExtreme(primary.id, 'front')),
        },
        { label: 'Send to back', run: () => session.execute(reorderExtreme(primary.id, 'back')) },
      ],
    })
    actions.push({
      id: 'align',
      label: 'Align',
      menu: [
        { label: 'Align left', run: () => (selectedNodes.length > 1 ? performAlign('left') : alignSingle('left')) },
        { label: 'Align center', run: () => (selectedNodes.length > 1 ? performAlign('center-x') : alignSingle('center-x')) },
        { label: 'Align right', run: () => (selectedNodes.length > 1 ? performAlign('right') : alignSingle('right')) },
        { label: 'Align top', run: () => (selectedNodes.length > 1 ? performAlign('top') : alignSingle('top')) },
        { label: 'Align middle', run: () => (selectedNodes.length > 1 ? performAlign('center-y') : alignSingle('center-y')) },
        { label: 'Align bottom', run: () => (selectedNodes.length > 1 ? performAlign('bottom') : alignSingle('bottom')) },
        { label: 'Distribute horizontally', run: () => performDistribute('x') },
        { label: 'Distribute vertically', run: () => performDistribute('y') },
      ],
    })
    return actions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary, selectedNodes.length])

  const shiftOrder = (delta: number) => {
    const id = primary?.id
    if (!id) return
    const siblings = session.document.root.pages.find(
      (page) => page.id === session.activePageId,
    )!.children
    const index = siblings.findIndex((node) => node.id === id)
    try {
      session.execute(reorderNode(id, index + delta))
    } catch {
      /* locked */
    }
  }

  const moreItems: MenuItem[] = primary
    ? [
        {
          label: primary.locked ? 'Unlock' : 'Lock',
          run: () => session.execute(setNodeLocked(primary.id, !primary.locked)),
        },
        {
          label: primary.visibility === 'shown' ? 'Hide' : 'Show',
          run: () => {
            session.execute(
              setNodeVisibility(primary.id, primary.visibility === 'shown' ? 'hidden' : 'shown'),
            )
            if (primary.visibility === 'shown') session.selectNode(null)
          },
        },
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
        { label: 'Copy', shortcut: '⌘C', run: () => session.copySelection() },
        { label: 'Cut', shortcut: '⌘X', run: () => session.cutSelection() },
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
        run: () => session.paste('standard', docPointFromClient(event.clientX, event.clientY)),
      })
    if (items.length) setMenu({ x: event.clientX, y: event.clientY, items })
  }

  const insertDropFromPalette = null
  void insertDropFromPalette

  return (
    <div
      ref={hostRef}
      data-v5-canvas
      tabIndex={0}
      className="relative min-h-0 flex-1 overflow-auto bg-slate-200/70 outline-none"
      style={{
        cursor: panMode || session.tool === 'hand' ? 'grab' : session.tool === 'select' ? 'default' : 'crosshair',
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerDownCapture={(event) => {
        // Space-hand, the Hand tool, and middle-drag pan own the pointer before object
        // interaction; capture phase keeps node handlers from starting a move instead.
        if (panMode || session.tool === 'hand' || event.button === 1) {
          event.preventDefault()
          event.stopPropagation()
          beginPan(event)
          return
        }
      }}
      onPointerMove={onPointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={cancelGesture}
      onPointerLeave={() => setHoverId(null)}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement
        const nodeId =
          target.closest?.('[data-v5-node-id]')?.getAttribute('data-v5-node-id') ?? null
        const node = nodeId ? findNode(activePage.children, nodeId) : null
        openContextMenu(event, node)
      }}
    >
      <div className="relative" style={{ width: contentSize.width, height: contentSize.height }}>
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
                session.setActivePage(page.id)
                const doc = docPointFromClient(event.clientX, event.clientY, page.id)
                if (
                  !panMode &&
                  (session.tool === 'text' || session.tool === 'shape' || session.tool === 'image' || session.tool === 'table')
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
                  base: session.selectedNodeIds,
                })
              }}
              style={{
                position: 'absolute',
                left: offset.x,
                top: offset.y,
                width: page.width * zoom,
                height: page.height * zoom,
                background: 'white',
                boxShadow: '0 1px 6px rgb(0 0 0 / .18)',
                outline: isActive ? '2px solid #2563eb' : '1px solid #cbd5e1',
                outlineOffset: 4,
              }}
            >
              {session.editScopeId && isActive ? (
                <div
                  aria-label="Group scope boundary"
                  style={{
                    position: 'absolute',
                    inset: -6,
                    border: '1px dashed #60a5fa',
                    pointerEvents: 'none',
                  }}
                />
              ) : null}
              {scopeChildren.map((node) => (
                <NodeView
                  key={node.id}
                  node={node}
                  zoom={zoom}
                  isSelected={session.selectedNodeIds.includes(node.id)}
                  isHovered={hoverId === node.id}
                  isCandidate={
                    marquee?.pageId === page.id &&
                    containsPoint(
                      {
                        x: Math.min(marquee.startDoc.x, marquee.currentDoc.x),
                        y: Math.min(marquee.startDoc.y, marquee.currentDoc.y),
                        width: Math.abs(marquee.currentDoc.x - marquee.startDoc.x),
                        height: Math.abs(marquee.currentDoc.y - marquee.startDoc.y),
                      },
                      corners(node.geometry),
                    )
                  }
                  preview={preview[node.id]}
                  editing={editingText?.id === node.id}
                  onPointerDown={beginMove}
                  onDoubleClick={(target) => {
                    if (target.role === 'group') session.enterGroup(target.id)
                    else if (target.kind === 'text') startTextEditing(target)
                  }}
                />
              ))}
              {editingText && isActive && (
                <TextEditor
                  node={allScopeNodes.find((candidate) => candidate.id === editingText.id)!}
                  zoom={zoom}
                  value={editingText.value}
                  onChange={(value) => setEditingText({ ...editingText, value })}
                  onCommit={() => commitTextEditing(false)}
                  onCancel={() => commitTextEditing(true)}
                  onAutoHeight={(heightPx) => handleTextAutoHeight(editingText.id, heightPx)}
                />
              )}
              {showHandles && primary && (
                <SelectionOverlay
                  bounds={{
                    x: (preview[primary.id]?.x ?? primary.geometry.x) * zoom,
                    y: (preview[primary.id]?.y ?? primary.geometry.y) * zoom,
                    width: (preview[primary.id]?.width ?? primary.geometry.width) * zoom,
                    height: (preview[primary.id]?.height ?? primary.geometry.height) * zoom,
                  }}
                  onHandlePointerDown={beginResize}
                  onRotatePointerDown={beginRotate}
                  canRotate={canRotate(primary)}
                />
              )}
              {selectedNodes.length > 1 &&
                selectedNodes.map((node) => (
                  <div
                    key={node.id}
                    style={{
                      position: 'absolute',
                      left: (preview[node.id]?.x ?? node.geometry.x) * zoom,
                      top: (preview[node.id]?.y ?? node.geometry.y) * zoom,
                      width: node.geometry.width * zoom,
                      height: node.geometry.height * zoom,
                      outline: '1px solid #93c5fd',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
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
              {marquee?.pageId === page.id && (
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
              {guides.x !== undefined && isActive && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: guides.x * zoom,
                    width: 1,
                    background: '#f43f5e',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {guides.y !== undefined && isActive && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: guides.y * zoom,
                    height: 1,
                    background: '#f43f5e',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </section>
          )
        })}
        {/* screen-space badges */}
        {badge && (
          <div
            style={{
              position: 'fixed',
              bottom: 56,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#111827',
              color: 'white',
              fontSize: 12,
              borderRadius: 6,
              padding: '2px 8px',
              pointerEvents: 'none',
            }}
          >
            {badge}
          </div>
        )}
      </div>
      {!gesture && !editingText && primary && (
        <ContextToolbar
          bounds={primaryViewportRect(primary.id)}
          viewport={hostRef.current?.getBoundingClientRect()}
          actions={toolbarActions}
          more={moreItems}
        />
      )}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-1 rounded-md border bg-background p-1 text-xs shadow-sm">
        <button
          type="button"
          aria-label="Zoom out"
          className="px-2"
          onClick={() => session.setZoom(zoom / 1.2)}
        >
          −
        </button>
        <span className="w-12 text-center" aria-live="polite">
          {Math.round((zoom / 0.01) * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          className="px-2"
          onClick={() => session.setZoom(zoom * 1.2)}
        >
          +
        </button>
        <button
          type="button"
          className="px-2"
          onClick={() => {
            const host = hostRef.current
            if (!host) return
            session.setZoom(
              Math.min(
                (host.clientWidth - 64) / activePage.width,
                (host.clientHeight - 64) / activePage.height,
              ),
            )
          }}
        >
          Fit
        </button>
        <button type="button" className="px-2" onClick={() => session.setZoom(0.01)}>
          100%
        </button>
      </div>
      {confirmDelete && (
        <div
          role="alertdialog"
          aria-label="Confirm delete"
          className="absolute inset-0 z-20 grid place-items-center bg-black/30"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setConfirmDelete(null)
          }}
        >
          <div className="rounded-lg bg-background p-4 shadow-lg">
            <p className="mb-3 text-sm">
              Delete {confirmDelete.length > 1 ? `${confirmDelete.length} objects` : 'object'}? This
              can be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1 text-sm"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                className="rounded bg-red-600 px-3 py-1 text-sm text-white"
                onClick={() => {
                  try {
                    session.execute(deleteNodes(confirmDelete))
                  } catch {
                    /* locked */
                  }
                  setConfirmDelete(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

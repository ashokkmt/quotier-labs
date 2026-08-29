import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { moveNodes, resizeNode, rotateNode, type ResizeHandle } from './commands'
import { bounds, corners } from './geometry'
import { SelectionOverlay } from './SelectionOverlay'
import { useV5Session } from './store'
import type { V5Geometry, V5Node } from './model'

type Gesture = {
  kind: 'move' | 'resize' | 'rotate'
  startX: number
  startY: number
  handle?: ResizeHandle
  id: string
  geometry: V5Geometry
  startRotation?: number
}
function flatten(nodes: V5Node[]): V5Node[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])])
}

function NodeView({
  node,
  zoom,
  selected,
  preview,
  onPointerDown,
  onSelect,
  onEnterGroup,
}: {
  node: V5Node
  zoom: number
  selected: boolean
  preview?: { x: number; y: number; rotation?: number }
  onPointerDown: (node: V5Node, event: PointerEvent<HTMLDivElement>) => void
  onSelect: (id: string, additive?: boolean) => void
  onEnterGroup: (id: string) => void
}) {
  const g = node.geometry
  const x = preview?.x ?? g.x
  const y = preview?.y ?? g.y
  const rotation = preview?.rotation ?? g.rotation
  if (node.visibility === 'hidden') return null
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={node.name ?? node.kind}
      onPointerDown={(event) => onPointerDown(node, event)}
      onDoubleClick={() => node.role === 'group' && onEnterGroup(node.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && node.role === 'group') onEnterGroup(node.id)
        else if (event.key === 'Enter') onSelect(node.id)
      }}
      style={{
        position: 'absolute',
        left: x * zoom,
        top: y * zoom,
        width: g.width * zoom,
        height: g.height * zoom,
        transform: `rotate(${rotation / 100}deg)`,
        outline: selected ? '2px solid #2563eb' : '1px solid transparent',
        opacity: node.locked ? 0.65 : 1,
        cursor: node.locked ? 'not-allowed' : 'move',
      }}
    >
      {node.kind === 'text'
        ? String(node.props?.text ?? node.name ?? '')
        : node.kind === 'table'
          ? 'Table'
          : node.role === 'flow-frame'
            ? 'Flow frame'
            : null}
      {node.children?.map((child) => (
        <NodeView
          key={child.id}
          node={child}
          zoom={zoom}
          selected={selected}
          onPointerDown={onPointerDown}
          onSelect={onSelect}
          onEnterGroup={onEnterGroup}
        />
      ))}
    </div>
  )
}

export function V5Canvas({ zoom = 0.01 }: { zoom?: number }) {
  const session = useV5Session()
  const hostRef = useRef<HTMLDivElement>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [marquee, setMarquee] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [preview, setPreview] = useState<
    Record<string, { x: number; y: number; rotation?: number }>
  >({})
  const page = session.document.root.pages[0]
  const scopeNodes = useMemo(
    () =>
      session.editScopeId
        ? (flatten(page.children).find((node) => node.id === session.editScopeId)?.children ?? [])
        : page.children,
    [page, session.editScopeId],
  )
  const allNodes = useMemo(() => flatten(scopeNodes), [scopeNodes])
  const selectedNodes = allNodes.filter((node) => session.selectedNodeIds.includes(node.id))
  const selectionBounds = selectedNodes.length
    ? bounds(
        selectedNodes.flatMap((node) =>
          corners({
            ...node.geometry,
            x: preview[node.id]?.x ?? node.geometry.x,
            y: preview[node.id]?.y ?? node.geometry.y,
            rotation: preview[node.id]?.rotation ?? node.geometry.rotation,
          }).map((point) => ({ x: point.x * zoom, y: point.y * zoom })),
        ),
      )
    : null
  const pointerPosition = (event: PointerEvent) => {
    const rect = hostRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }
  const beginMove = (node: V5Node, event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (node.locked) return
    session.selectNode(node.id, event.shiftKey || event.metaKey || event.ctrlKey)
    const selected = session.selectedNodeIds.includes(node.id) ? session.selectedNodeIds : [node.id]
    const point = pointerPosition(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({
      kind: 'move',
      startX: point.x,
      startY: point.y,
      id: node.id,
      geometry: node.geometry,
    })
    setPreview(
      Object.fromEntries(
        selected.map((id) => {
          const target = allNodes.find((candidate) => candidate.id === id)!
          return [id, { x: target.geometry.x, y: target.geometry.y }]
        }),
      ),
    )
  }
  const beginResize = (handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const node = selectedNodes[0]
    if (!node || node.locked) return
    const point = pointerPosition(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({
      kind: 'resize',
      startX: point.x,
      startY: point.y,
      handle,
      id: node.id,
      geometry: node.geometry,
    })
  }
  const beginRotate = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const node = selectedNodes[0]
    if (!node || node.locked || node.role === 'flow-frame') return
    const point = pointerPosition(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({
      kind: 'rotate',
      startX: point.x,
      startY: point.y,
      id: node.id,
      geometry: node.geometry,
      startRotation: node.geometry.rotation / 100,
    })
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointerPosition(event)
    if (marquee) {
      setMarquee((current) =>
        current ? { ...current, width: point.x - current.x, height: point.y - current.y } : null,
      )
      return
    }
    if (!gesture) return
    const dx = (point.x - gesture.startX) / zoom,
      dy = (point.y - gesture.startY) / zoom
    if (gesture.kind === 'move')
      setPreview(
        Object.fromEntries(
          session.selectedNodeIds.map((id) => {
            const node = allNodes.find((candidate) => candidate.id === id)!
            return [id, { x: node.geometry.x + dx, y: node.geometry.y + dy }]
          }),
        ),
      )
    if (gesture.kind === 'rotate') {
      const degrees = (gesture.startRotation ?? 0) + (Math.atan2(dy, dx) * 180) / Math.PI
      setPreview({
        [gesture.id]: {
          x: gesture.geometry.x,
          y: gesture.geometry.y,
          rotation: (event.shiftKey ? Math.round(degrees / 15) * 15 : degrees) * 100,
        },
      })
    }
  }
  const finishGesture = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointerPosition(event)
    if (marquee) {
      const x1 = Math.min(marquee.x, marquee.x + marquee.width),
        x2 = Math.max(marquee.x, marquee.x + marquee.width),
        y1 = Math.min(marquee.y, marquee.y + marquee.height),
        y2 = Math.max(marquee.y, marquee.y + marquee.height)
      session.selectNodes(
        scopeNodes
          .filter((node) => {
            const g = node.geometry
            return (
              g.x * zoom < x2 &&
              (g.x + g.width) * zoom > x1 &&
              g.y * zoom < y2 &&
              (g.y + g.height) * zoom > y1
            )
          })
          .map((node) => node.id),
      )
      setMarquee(null)
      return
    }
    if (!gesture) return
    const dx = (point.x - gesture.startX) / zoom,
      dy = (point.y - gesture.startY) / zoom
    if (gesture.kind === 'move')
      session.execute(
        moveNodes(
          Object.keys(preview),
          event.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? dx : 0) : dx,
          event.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? 0 : dy) : dy,
        ),
      )
    if (gesture.kind === 'resize' && gesture.handle)
      session.execute(
        resizeNode(gesture.id, gesture.handle, dx, dy, {
          fromCenter: event.altKey,
          preserveAspect: event.shiftKey,
        }),
      )
    if (gesture.kind === 'rotate')
      session.execute(
        rotateNode(
          gesture.id,
          (preview[gesture.id]?.rotation ?? gesture.geometry.rotation) / 100,
          event.shiftKey,
        ),
      )
    setGesture(null)
    setPreview({})
  }
  const cancelGesture = () => {
    setGesture(null)
    setPreview({})
    setMarquee(null)
  }
  return (
    <div
      ref={hostRef}
      data-v5-canvas
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          if (session.editScopeId) session.exitGroup()
          else session.selectNode(null)
        }
        if (event.key.startsWith('Arrow') && selectedNodes.length) {
          event.preventDefault()
          const amount = event.shiftKey ? 1000 : 100
          const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0
          const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0
          session.execute(moveNodes(session.selectedNodeIds, dx, dy))
        }
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        const point = pointerPosition(event)
        setMarquee({ x: point.x, y: point.y, width: 0, height: 0 })
      }}
      onPointerMove={onPointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={cancelGesture}
      onLostPointerCapture={cancelGesture}
    >
      {session.document.root.pages.map((currentPage) => (
        <section
          key={currentPage.id}
          aria-label={`Page ${currentPage.id}`}
          style={{
            position: 'relative',
            width: currentPage.width * zoom,
            height: currentPage.height * zoom,
            background: 'white',
            marginBottom: 24,
            boxShadow: '0 1px 4px rgb(0 0 0 / .2)',
          }}
        >
          {scopeNodes.map((node) => (
            <NodeView
              key={node.id}
              node={node}
              zoom={zoom}
              selected={session.selectedNodeIds.includes(node.id)}
              preview={preview[node.id]}
              onPointerDown={beginMove}
              onSelect={session.selectNode}
              onEnterGroup={session.enterGroup}
            />
          ))}
          {selectionBounds && (
            <SelectionOverlay
              bounds={selectionBounds}
              onHandlePointerDown={beginResize}
              onRotatePointerDown={beginRotate}
            />
          )}
          {marquee && (
            <div
              aria-label="Marquee selection"
              style={{
                position: 'absolute',
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
                border: '1px dashed #2563eb',
                background: '#2563eb22',
                pointerEvents: 'none',
              }}
            />
          )}
        </section>
      ))}
    </div>
  )
}

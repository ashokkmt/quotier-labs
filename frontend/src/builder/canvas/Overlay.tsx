import { useLayoutEffect, useState, type RefObject } from 'react'
import { useBuilderStore } from '../document/store'
import type { OperationPlan } from '../geometry/placement'

type Rect = { top: number; left: number; width: number; height: number }
const relative = (host: HTMLElement, nodeId: string): Rect | null => {
  const element = host.querySelector<HTMLElement>(`[data-builder-node="${nodeId}"]`)
  if (!element) return null
  const outer = host.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top - outer.top,
    left: rect.left - outer.left,
    width: rect.width,
    height: rect.height,
  }
}
export function Overlay({
  hostRef,
  plan,
}: {
  hostRef: RefObject<HTMLDivElement | null>
  plan?: OperationPlan | null
}) {
  const selected = useBuilderStore((state) => state.selectedNodeId)
  const hovered = useBuilderStore((state) => state.hoveredNodeId)
  const deleteSelected = useBuilderStore((state) => state.deleteSelected)
  const duplicateSelected = useBuilderStore((state) => state.duplicateSelected)
  const setDrag = useBuilderStore((state) => state.setDrag)
  const nodes = useBuilderStore((state) => state.nodes)
  const resize = useBuilderStore((state) => state.resize)
  const updateLayout = useBuilderStore((state) => state.updateLayout)
  const selectedNode = selected ? nodes[selected] : undefined
  const selectedParent = selectedNode?.parentId ? nodes[selectedNode.parentId] : undefined
  const canResize = Boolean(
    selectedNode &&
    selectedParent?.layout.direction === 'horizontal' &&
    selectedParent.children.indexOf(selectedNode.id) < selectedParent.children.length - 1,
  )
  const canResizeImage = selectedNode?.type === 'image'
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null)
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null)
  const [dropRect, setDropRect] = useState<Rect | null>(null)
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const update = () => {
      setSelectedRect(selected ? relative(host, selected) : null)
      setHoveredRect(!plan && hovered && hovered !== selected ? relative(host, hovered) : null)
      const target = plan?.targetId
        ? relative(host, plan.targetId)
        : plan
          ? relative(host, plan.parentId)
          : null
      if (!target || !plan) return setDropRect(null)
      setDropRect(
        plan.preview === 'split'
          ? {
              ...target,
              left: plan.side === 'left' ? target.left : target.left + target.width / 2,
              width: target.width / 2,
            }
          : plan.preview === 'inside'
            ? {
                top: target.top + 6,
                left: target.left + 6,
                width: target.width - 12,
                height: Math.max(64, target.height - 12),
              }
            : plan.axis === 'horizontal'
              ? {
                  top: target.top,
                  left:
                    target.left +
                    (plan.linePosition === 'before' ? -Math.min(target.width, 96) : target.width),
                  width: Math.min(target.width, 96),
                  height: target.height,
                }
              : {
                  top: target.top + (plan.linePosition === 'before' ? -36 : target.height),
                  left: target.left,
                  width: target.width,
                  height: 36,
                },
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [hostRef, selected, hovered, plan])
  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {hoveredRect && <div className="absolute border border-blue-400" style={hoveredRect} />}
      {selectedRect && (
        <>
          <div className="absolute border-2 border-blue-500 bg-blue-500/10" style={selectedRect} />
          <div
            className="absolute flex gap-1 pointer-events-auto items-center"
            style={{
              top: Math.max(0, selectedRect.top - 28),
              left: selectedRect.left + selectedRect.width / 2,
              transform: 'translateX(-50%)',
            }}
          >
            <button
              aria-label="Move selected element"
              className="rounded bg-blue-600 px-2 text-xs text-white cursor-grab"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (selected)
                  setDrag({
                    source: { type: 'move', nodeId: selected },
                    x: event.clientX,
                    y: event.clientY,
                    startX: event.clientX,
                    startY: event.clientY,
                    active: false,
                    resolution: null,
                  })
              }}
            >
              Move
            </button>
            <button
              aria-label="Duplicate selected element"
              className="rounded bg-blue-600 px-2 text-xs text-white"
              onClick={(event) => {
                event.stopPropagation()
                duplicateSelected()
              }}
            >
              Copy
            </button>
            <button
              aria-label="Delete selected element"
              className="rounded bg-red-600 px-2 text-xs text-white"
              onClick={(event) => {
                event.stopPropagation()
                deleteSelected()
              }}
            >
              Delete
            </button>
            {(selectedNode?.role === 'container' || selectedNode?.role === 'root') && (
              <button
                aria-label="Add content to selected container"
                className="rounded bg-blue-600 px-2 text-xs text-white"
                onClick={(event) => {
                  event.stopPropagation()
                  if (selected)
                    window.dispatchEvent(
                      new CustomEvent('builder:add', {
                        detail: { id: selected, x: event.clientX, y: event.clientY },
                      }),
                    )
                }}
              >
                +
              </button>
            )}
            {canResize && (
              <input
                aria-label="Resize selected column"
                className="w-20"
                type="range"
                min="1000"
                max="9000"
                step="100"
                value={selectedNode?.layout.basis ?? 5000}
                onChange={(event) => selected && resize(selected, Number(event.target.value))}
              />
            )}
          </div>
          {canResizeImage && (
            <button
              type="button"
              aria-label="Resize selected image"
              className="absolute h-3 w-3 rounded-sm border-2 border-white bg-blue-600 pointer-events-auto cursor-nwse-resize"
              style={{
                left: selectedRect.left + selectedRect.width - 6,
                top: selectedRect.top + selectedRect.height - 6,
              }}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!selected) return
                const startX = event.clientX
                const startWidth = Number(selectedNode?.layout.imageWidth ?? 100)
                const onMove = (move: PointerEvent) => {
                  const next = Math.max(
                    10,
                    Math.min(
                      100,
                      startWidth +
                        ((move.clientX - startX) / Math.max(selectedRect.width, 1)) * 100,
                    ),
                  )
                  updateLayout(selected, 'imageWidth', Math.round(next))
                }
                const onEnd = () => {
                  window.removeEventListener('pointermove', onMove)
                  window.removeEventListener('pointerup', onEnd)
                }
                window.addEventListener('pointermove', onMove)
                window.addEventListener('pointerup', onEnd, { once: true })
              }}
            />
          )}
        </>
      )}
      {dropRect && (
        <div
          className={
            plan?.preview === 'split' || plan?.preview === 'line' || plan?.preview === 'inside'
              ? 'absolute border-2 border-dashed border-blue-500 bg-blue-500/15'
              : 'absolute border-2 border-dashed border-blue-500 bg-blue-500/15'
          }
          style={dropRect}
        />
      )}
    </div>
  )
}

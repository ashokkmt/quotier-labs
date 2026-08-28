import { useEffect, useState, useRef } from 'react'
import { useBuilderStore } from '../document/store'
import type { PlacementIntent } from '../geometry/placement'

type Rect = { top: number; left: number; width: number; height: number }

export function Overlay({ dragResolution }: { dragResolution?: PlacementIntent | null }) {
  const selectedNodeId = useBuilderStore((s) => s.selectedNodeId)
  const hoveredNodeId = useBuilderStore((s) => s.hoveredNodeId)
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null)
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null)
  const [dropLine, setDropLine] = useState<Rect | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame: number
    const updateGeometry = () => {
      if (!containerRef.current) return
      const containerBounds = containerRef.current.getBoundingClientRect()

      const getRelativeRect = (el: Element): Rect => {
        const bounds = el.getBoundingClientRect()
        return {
          top: bounds.top - containerBounds.top,
          left: bounds.left - containerBounds.left,
          width: bounds.width,
          height: bounds.height,
        }
      }

      if (selectedNodeId) {
        const el = document.querySelector(`[data-builder-node="${selectedNodeId}"]`)
        if (el) setSelectedRect(getRelativeRect(el))
        else setSelectedRect(null)
      } else {
        setSelectedRect(null)
      }

      if (hoveredNodeId && hoveredNodeId !== selectedNodeId && !dragResolution) {
        const el = document.querySelector(`[data-builder-node="${hoveredNodeId}"]`)
        if (el) setHoveredRect(getRelativeRect(el))
        else setHoveredRect(null)
      } else {
        setHoveredRect(null)
      }

      if (dragResolution) {
        const parentEl = document.querySelector(`[data-builder-node="${dragResolution.parentId}"]`)
        const targetEl = dragResolution.targetId
          ? document.querySelector(`[data-builder-node="${dragResolution.targetId}"]`)
          : null

        if (dragResolution.intent === 'inside' && parentEl) {
          const p = getRelativeRect(parentEl)
          setDropLine({ top: p.top + 4, left: p.left + 4, width: p.width - 8, height: 4 })
        } else if (targetEl) {
          const t = getRelativeRect(targetEl)
          if (dragResolution.intent === 'before') {
            setDropLine({ top: t.top - 2, left: t.left, width: t.width, height: 4 })
          } else if (dragResolution.intent === 'after') {
            setDropLine({ top: t.top + t.height - 2, left: t.left, width: t.width, height: 4 })
          } else if (dragResolution.intent === 'wrap-left') {
            setDropLine({ top: t.top, left: t.left, width: t.width / 2, height: t.height })
          } else if (dragResolution.intent === 'wrap-right') {
            setDropLine({
              top: t.top,
              left: t.left + t.width / 2,
              width: t.width / 2,
              height: t.height,
            })
          }
        } else {
          setDropLine(null)
        }
      } else {
        setDropLine(null)
      }

      frame = requestAnimationFrame(updateGeometry)
    }
    frame = requestAnimationFrame(updateGeometry)
    return () => cancelAnimationFrame(frame)
  }, [selectedNodeId, dragResolution])

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
      {hoveredRect && (
        <div
          className="absolute border border-blue-400 pointer-events-none transition-all duration-75"
          style={{
            top: hoveredRect.top,
            left: hoveredRect.left,
            width: hoveredRect.width,
            height: hoveredRect.height,
          }}
        />
      )}
      {selectedRect && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none transition-all duration-75"
          style={{
            top: selectedRect.top,
            left: selectedRect.left,
            width: selectedRect.width,
            height: selectedRect.height,
          }}
        />
      )}
      {dropLine && (
        <div
          className={`absolute rounded pointer-events-none transition-all duration-75 ${dragResolution?.intent.startsWith('wrap') ? 'bg-blue-500/20 border-2 border-blue-500 border-dashed' : 'bg-blue-600 rounded-full shadow-[0_0_0_2px_white]'}`}
          style={{
            top: dropLine.top,
            left: dropLine.left,
            width: dropLine.width,
            height: dropLine.height,
          }}
        />
      )}
    </div>
  )
}

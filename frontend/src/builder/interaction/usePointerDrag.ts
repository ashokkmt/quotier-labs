import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { DragSource } from '../document/store'
import { useBuilderStore } from '../document/store'

export function usePointerDrag(onCommit: (source: DragSource, resolution: any) => void) {
  const drag = useBuilderStore((s) => s.drag)
  const setDrag = useBuilderStore((s) => s.setDrag)

  const frame = useRef<number | null>(null)
  const pending = useRef<PointerEvent | null>(null)

  useEffect(() => {
    if (!drag) return
    const move = (event: PointerEvent) => {
      pending.current = event
      if (frame.current !== null) return
      frame.current = requestAnimationFrame(() => {
        const point = pending.current
        frame.current = null
        if (point) {
          setDrag((current) =>
            current ? { ...current, x: point.clientX, y: point.clientY } : null,
          )
        }
      })
    }
    const up = () => {
      if (drag) onCommit(drag.source, drag.resolution)
      setDrag(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })

    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [drag, onCommit, setDrag])

  const begin = (event: ReactPointerEvent | PointerEvent, source: DragSource) => {
    if (event.button !== 0) return
    event.preventDefault()
    setDrag({
      source,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      resolution: null,
    })
  }

  return {
    drag,
    begin,
    setResolution: (resolution: any) =>
      setDrag((current) => (current ? { ...current, resolution } : null)),
    cancel: () => setDrag(null),
  }
}

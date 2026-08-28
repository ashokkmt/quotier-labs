import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { DragSource } from '../document/store'
import { useBuilderStore } from '../document/store'

export function usePointerDrag(onCommit: (source: DragSource, resolution: any) => void) {
  const drag = useBuilderStore((s) => s.drag)
  const setDrag = useBuilderStore((s) => s.setDrag)
  const setDragResolution = useBuilderStore((s) => s.setDragResolution)

  const frame = useRef<number | null>(null)
  const pending = useRef<PointerEvent | null>(null)

  // This ref is needed to access current drag state in the pointerup handler
  // without re-binding the event listener on every drag state change
  const dragRef = useRef(drag)
  dragRef.current = drag

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
      const current = dragRef.current
      if (current) onCommit(current.source, current.resolution)
      setDrag(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })

    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [drag !== null, onCommit, setDrag])

  const begin = (event: ReactPointerEvent | PointerEvent, source: DragSource) => {
    if (event.button !== 0) return
    event.preventDefault()
    setDrag({ source, x: event.clientX, y: event.clientY, resolution: null })
  }

  return { drag, begin, setResolution: setDragResolution, cancel: () => setDrag(null) }
}

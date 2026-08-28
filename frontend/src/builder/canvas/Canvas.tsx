import { useEffect, useMemo, useRef } from 'react'
import { CanvasNode } from './CanvasNode'
import { Overlay } from './Overlay'
import { useBuilderStore } from '../document/store'
import { resolvePlacement } from '../geometry/placement'

export function Canvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootId = useBuilderStore((state) => state.rootId)
  const nodes = useBuilderStore((state) => state.nodes)
  const drag = useBuilderStore((state) => state.drag)
  const setDrag = useBuilderStore((state) => state.setDrag)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const hoverNode = useBuilderStore((state) => state.hoverNode)
  const commitPlan = useBuilderStore((state) => state.commitPlan)
  const deleteSelected = useBuilderStore((state) => state.deleteSelected)
  const duplicateSelected = useBuilderStore((state) => state.duplicateSelected)
  const copySelected = useBuilderStore((state) => state.copySelected)
  const pasteIntoSelection = useBuilderStore((state) => state.pasteIntoSelection)
  const document = useMemo(() => ({ schemaVersion: 4 as const, rootId, nodes }), [rootId, nodes])

  useEffect(() => {
    if (!drag?.active || !hostRef.current) return
    const rects: Record<string, DOMRect> = {}
    hostRef.current.querySelectorAll<HTMLElement>('[data-builder-node]').forEach((element) => {
      const id = element.dataset.builderNode
      if (id) rects[id] = element.getBoundingClientRect()
    })
    const plan = resolvePlacement(document, drag.source, rects, { x: drag.x, y: drag.y })
    setDrag((current) => (current ? { ...current, resolution: plan } : null))
  }, [document, drag?.active, drag?.x, drag?.y, drag?.source, setDrag])

  useEffect(() => {
    if (!drag) return
    const move = (event: PointerEvent) =>
      setDrag((current) =>
        current
          ? {
              ...current,
              x: event.clientX,
              y: event.clientY,
              active:
                current.active ||
                Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= 4,
            }
          : null,
      )
    const end = () => {
      const current = useBuilderStore.getState().drag
      if (current?.active && current.resolution) commitPlan(current.resolution, current.source)
      else setDrag(null)
    }
    const cancel = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
    window.addEventListener('pointercancel', cancel, { once: true })
    window.addEventListener('keydown', (event) => event.key === 'Escape' && cancel(), {
      once: true,
    })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [drag, commitPlan, setDrag])

  return (
    <div
      ref={hostRef}
      tabIndex={0}
      className="relative min-h-[1123px] w-full bg-white text-black shadow-lg outline-none"
      onKeyDown={(event) => {
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          deleteSelected()
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault()
          duplicateSelected()
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
          event.preventDefault()
          copySelected()
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
          event.preventDefault()
          pasteIntoSelection()
        }
      }}
      onClick={(event) => {
        const element = (event.target as HTMLElement).closest<HTMLElement>('[data-builder-node]')
        selectNode(element?.dataset.builderNode ?? null)
      }}
      onPointerMove={(event) => {
        if (drag) return
        hoverNode(
          (event.target as HTMLElement).closest<HTMLElement>('[data-builder-node]')?.dataset
            .builderNode ?? null,
        )
      }}
      onPointerLeave={() => hoverNode(null)}
    >
      <div className="p-8 min-h-[1123px]">
        {nodes[rootId].children.length ? (
          <CanvasNode id={rootId} />
        ) : (
          <div
            data-builder-node={rootId}
            className="min-h-[1000px] border-2 border-dashed rounded text-muted-foreground flex items-center justify-center"
          >
            Drop or add content here
          </div>
        )}
      </div>
      <Overlay hostRef={hostRef} plan={drag?.resolution} />
    </div>
  )
}

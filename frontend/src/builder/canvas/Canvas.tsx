import { useCallback, useEffect, useRef } from 'react'
import { useBuilderStore } from '../document/store'
import { CanvasNode } from './CanvasNode'
import { Overlay } from './Overlay'
import { usePointerDrag } from '../interaction/usePointerDrag'
import { hitDropZone, RectCache } from '../geometry/hitTest'
import { predictPlacement, type PlacementIntent } from '../geometry/placement'

export function Canvas() {
  const store = useBuilderStore()
  const containerRef = useRef<HTMLDivElement>(null)

  // Expose geometry cache
  const rectCache = useRef(new RectCache())

  const handleCommit = useCallback(
    (source: any, resolution: PlacementIntent | null) => {
      if (!resolution) return
      const id =
        source.type === 'create' ? `n_${Math.random().toString(36).substring(2, 9)}` : source.nodeId

      if (source.type === 'create') {
        const newNode = {
          id,
          kind:
            source.widget === 'section'
              ? 'section'
              : source.widget === 'container'
                ? 'row'
                : ('column' as any), // naive mapping for now
          widget: source.widget,
          parentId: resolution.parentId,
          children: [],
          props: {},
          style: {},
          meta: { visible: true, optional: false },
        }

        if (resolution.intent === 'wrap-left' || resolution.intent === 'wrap-right') {
          store.wrapInRow(resolution.targetId!, newNode, resolution.intent === 'wrap-left')
        } else {
          store.addNode(newNode, resolution.parentId, resolution.index)
        }
      } else if (source.type === 'move') {
        if (resolution.intent === 'wrap-left' || resolution.intent === 'wrap-right') {
          store.wrapInRow(resolution.targetId!, store.nodes[id], resolution.intent === 'wrap-left')
        } else {
          store.moveNode(id, resolution.parentId, resolution.index)
        }
      }
    },
    [store],
  )

  const { drag, setResolution } = usePointerDrag(handleCommit)

  // Listen to drag updates and calculate placement
  useEffect(() => {
    if (!drag) return
    rectCache.current.beginFrame()

    const provider = {
      elementFromPoint: (x: number, y: number) => {
        // Find element at point, ignoring the overlay
        return document.elementFromPoint(x, y)
      },
      rectFor: (id: string) => {
        return rectCache.current.read(id, () => {
          const el = document.querySelector(`[data-builder-node="${id}"]`)
          return el ? el.getBoundingClientRect() : undefined
        })
      },
    }

    const dropZoneId = hitDropZone(provider, drag.x, drag.y, store.nodes)
    if (!dropZoneId) {
      setResolution(null)
      return
    }

    const parentNode = store.nodes[dropZoneId]
    const childrenNodes = parentNode.children.map((id) => store.nodes[id]).filter(Boolean)

    // Get rects for children
    const rects: Record<string, DOMRect> = {}
    for (const child of childrenNodes) {
      const rect = provider.rectFor(child.id)
      if (rect) rects[child.id] = rect
    }

    const resolution = predictPlacement(parentNode, childrenNodes, rects, { x: drag.x, y: drag.y })
    setResolution(resolution)
  }, [drag?.x, drag?.y, store.nodes]) // run when drag pos changes

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[800px] bg-white text-black shadow-lg rounded overflow-hidden"
      onClick={(e) => {
        const target = e.target as HTMLElement
        const nodeEl = target.closest('[data-builder-node]') as HTMLElement
        if (nodeEl?.dataset.builderNode) {
          store.selectNode(nodeEl.dataset.builderNode)
        } else {
          store.selectNode(null)
        }
      }}
    >
      <div
        className="w-full h-full isolate pointer-events-auto p-8"
        onPointerMove={(e) => {
          if (drag) return
          const target = e.target as HTMLElement
          const nodeEl = target.closest('[data-builder-node]') as HTMLElement
          if (nodeEl?.dataset.builderNode) {
            store.hoverNode(nodeEl.dataset.builderNode)
          } else {
            store.hoverNode(null)
          }
        }}
        onPointerLeave={() => store.hoverNode(null)}
      >
        <CanvasNode id={store.rootId} />
      </div>

      <Overlay dragResolution={drag?.resolution} />
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { CanvasNode } from './CanvasNode'
import { Overlay } from './Overlay'
import { useBuilderStore } from '../document/store'
import { resolvePlacement } from '../geometry/placement'
import { getWidget, listWidgets } from '../registry/registry'

const isTextEntry = (target: EventTarget | null) => {
  const element = target instanceof HTMLElement ? target : null
  return Boolean(element?.closest('input, textarea, [contenteditable="true"]'))
}

export function Canvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootId = useBuilderStore((state) => state.rootId)
  const nodes = useBuilderStore((state) => state.nodes)
  const drag = useBuilderStore((state) => state.drag)
  const setDrag = useBuilderStore((state) => state.setDrag)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const hoverNode = useBuilderStore((state) => state.hoverNode)
  const commitPlan = useBuilderStore((state) => state.commitPlan)
  const addWidget = useBuilderStore((state) => state.addWidget)
  const document = useMemo(() => ({ schemaVersion: 4 as const, rootId, nodes }), [rootId, nodes])

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (isTextEntry(event.target)) return
      const command = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (key === 'backspace' || key === 'delete') {
        event.preventDefault()
        useBuilderStore.getState().deleteSelected()
      } else if (command && key === 'a') {
        // Selecting the entire application is never meaningful in the builder.
        event.preventDefault()
      } else if (command && key === 'd') {
        event.preventDefault()
        useBuilderStore.getState().duplicateSelected()
      } else if (command && key === 'c') {
        event.preventDefault()
        useBuilderStore.getState().copySelected()
      } else if (command && key === 'v') {
        event.preventDefault()
        useBuilderStore.getState().pasteIntoSelection()
      }
    }
    window.addEventListener('keydown', handleKeyboard, true)
    return () => window.removeEventListener('keydown', handleKeyboard, true)
  }, [])

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
      onClick={(event) => {
        const element = (event.target as HTMLElement).closest<HTMLElement>('[data-builder-node]')
        const id = element?.dataset.builderNode
        selectNode(id && id !== rootId ? id : null)
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
        <CanvasNode id={rootId} />
      </div>
      <QuickAdd nodes={nodes} onAdd={addWidget} />
      <Overlay hostRef={hostRef} plan={drag?.resolution} />
    </div>
  )
}

function QuickAdd({
  nodes,
  onAdd,
}: {
  nodes: ReturnType<typeof useBuilderStore.getState>['nodes']
  onAdd: (widget: string) => boolean
}) {
  const [target, setTarget] = useState<{ id: string; x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const widgets = listWidgets()
  const used = new Set(Object.values(nodes).map((node) => node.type))
  const matches = widgets.filter((widget) =>
    widget.metadata.label.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const recent = matches.filter((widget) => used.has(widget.type))
  const available = matches.filter((widget) => !used.has(widget.type))
  const renderItem = (widget: ReturnType<typeof getWidget>) =>
    widget ? (
      <button
        key={widget.type}
        type="button"
        className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
        onClick={() => {
          useBuilderStore.getState().selectNode(target?.id ?? null)
          onAdd(widget.type)
          setTarget(null)
          setQuery('')
        }}
      >
        <span className="font-medium">{widget.metadata.label}</span>
        <span className="ml-2 text-xs text-muted-foreground">{widget.category}</span>
      </button>
    ) : null
  useEffect(() => {
    const open = (event: Event) =>
      setTarget((event as CustomEvent<{ id: string; x: number; y: number }>).detail)
    window.addEventListener('builder:add', open)
    return () => window.removeEventListener('builder:add', open)
  }, [])
  if (!target) return null
  const left = Math.max(12, Math.min(target.x - 144, window.innerWidth - 300))
  const top = Math.max(12, Math.min(target.y + 12, window.innerHeight - 390))
  return (
    <div
      className="fixed z-50 w-72 rounded-lg border bg-popover p-2 shadow-xl"
      style={{ left, top }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="px-1 pb-2 font-medium">Add to document</div>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-8"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search widgets"
        />
      </div>
      <div className="max-h-72 overflow-y-auto">
        {recent.length > 0 && (
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Used in this document
          </p>
        )}
        {recent.map(renderItem)}
        {available.length > 0 && (
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">All widgets</p>
        )}
        {available.map(renderItem)}
        {!matches.length && (
          <p className="px-2 py-4 text-sm text-muted-foreground">No matching widgets.</p>
        )}
      </div>
    </div>
  )
}

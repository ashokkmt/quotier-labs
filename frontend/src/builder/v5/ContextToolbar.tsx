import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Bounds } from './geometry'
import type { MenuItem } from './ContextMenu'

export type ToolbarAction = {
  id: string
  label: string
  shortcut?: string
  run?: () => void
  menu?: MenuItem[]
}

export const CONTEXT_GAP_PX = 8

/** Compact capability-driven toolbar anchored outside the selection bounds (ui-ux §6.10). */
export function ContextToolbar({
  bounds,
  viewport,
  actions,
  more,
}: {
  /** Selection rect in fixed viewport coordinates. */
  bounds: Bounds
  viewport?: DOMRect | null
  actions: ToolbarAction[]
  more: MenuItem[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (!viewport) return
    const width = ref.current?.offsetWidth ?? 240
    const height = 32
    // Prefer above, then below, then clamp; never cover the selection (ui-ux §8).
    let left = bounds.x + bounds.width / 2 - width / 2
    left = Math.max(
      viewport.left + CONTEXT_GAP_PX,
      Math.min(left, viewport.right - width - CONTEXT_GAP_PX),
    )
    let top = bounds.y - height - CONTEXT_GAP_PX
    if (top < viewport.top + CONTEXT_GAP_PX) top = bounds.y + bounds.height + CONTEXT_GAP_PX
    top = Math.min(top, viewport.bottom - height - CONTEXT_GAP_PX)
    setPosition({ left, top })
  }, [bounds, viewport])

  useEffect(() => {
    const close = () => setOpenMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [])

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selection actions"
      data-v5-context-toolbar
      className="z-10 flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm"
      style={{
        position: 'fixed',
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? 'visible' : 'hidden',
        transition: 'opacity 120ms ease-out',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {actions.map((action) =>
        action.menu ? (
          <div key={action.id} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={openMenu === action.id}
              title={action.label}
              className="rounded px-2 py-1 text-xs hover:bg-accent"
              onClick={(event) => {
                event.stopPropagation()
                setOpenMenu(openMenu === action.id ? null : action.id)
              }}
            >
              {action.label} ▾
            </button>
            {openMenu === action.id && (
              <MenuList items={action.menu} onClose={() => setOpenMenu(null)} />
            )}
          </div>
        ) : (
          <button
            key={action.id}
            type="button"
            title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
            className="rounded px-2 py-1 text-xs hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation()
              action.run?.()
            }}
          >
            {action.label}
          </button>
        ),
      )}
      {more.length > 0 && (
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-label="More actions"
            className="rounded px-2 py-1 text-xs hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation()
              setOpenMenu(openMenu === '__more__' ? null : '__more__')
            }}
          >
            …
          </button>
          {openMenu === '__more__' && <MenuList items={more} onClose={() => setOpenMenu(null)} />}
        </div>
      )}
    </div>
  )
}

export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  return (
    <div
      role="menu"
      className="absolute left-0 top-full z-20 mt-1 min-w-44 rounded-md border bg-background p-1 shadow-md"
    >
      {items.map((item) =>
        item.menu ? (
          <div
            key={item.label}
            className="relative"
            onMouseEnter={() => setOpenSubmenu(item.label)}
            onMouseLeave={() => setOpenSubmenu(null)}
          >
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-accent"
              onClick={() => setOpenSubmenu(item.label)}
            >
              {item.label} <span aria-hidden>▸</span>
            </button>
            {openSubmenu === item.label && (
              <div className="absolute left-full top-0">
                <MenuList items={item.menu} onClose={onClose} />
              </div>
            )}
          </div>
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-accent ${
              item.destructive ? 'text-red-600' : ''
            }`}
            onClick={(event) => {
              event.stopPropagation()
              item.run?.()
              onClose()
            }}
          >
            {item.label}
            {item.shortcut && <span className="pl-4 text-muted-foreground">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  )
}

import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Bounds } from './geometry'
import type { MenuItem } from './ContextMenu'

export type ToolbarAction = {
  id: string
  label: string
  shortcut?: string
  icon?: LucideIcon
  run?: () => void
  menu?: MenuItem[]
}

export const CONTEXT_GAP_PX = 8

export function ContextToolbar({
  bounds,
  viewport,
  actions,
  more,
  topClearance = 0,
}: {
  bounds: Bounds
  viewport?: DOMRect | null
  actions: ToolbarAction[]
  more: MenuItem[]
  topClearance?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!viewport) return
    const width = ref.current?.offsetWidth ?? 180
    const height = ref.current?.offsetHeight ?? 38
    let left = bounds.x + bounds.width / 2 - width / 2
    left = Math.max(
      viewport.left + CONTEXT_GAP_PX,
      Math.min(left, viewport.right - width - CONTEXT_GAP_PX),
    )
    let top = bounds.y - height - CONTEXT_GAP_PX - topClearance
    // Reserve the top toolbar safe area, then flip below the selection.
    if (top < viewport.top + 64) top = bounds.y + bounds.height + CONTEXT_GAP_PX
    top = Math.max(
      viewport.top + CONTEXT_GAP_PX,
      Math.min(top, viewport.bottom - height - CONTEXT_GAP_PX),
    )
    setPosition({ left, top })
    // The primitive viewport edges are the intentional dependency surface; DOMRect identity
    // changes on every render and would create a measure/set-state loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    viewport?.left,
    viewport?.top,
    viewport?.right,
    viewport?.bottom,
    topClearance,
  ])

  return (
    <TooltipProvider delayDuration={450}>
      <div
        ref={ref}
        role="toolbar"
        aria-label="Selection actions"
        data-v5-context-toolbar
        className="z-30 flex h-10 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-1 shadow-lg motion-safe:animate-in motion-safe:fade-in-0"
        style={{
          position: 'fixed',
          left: position?.left ?? -9999,
          top: position?.top ?? -9999,
          visibility: position ? 'visible' : 'hidden',
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {actions
          .slice(0, 5)
          .map((action) =>
            action.menu ? (
              <ActionDropdown key={action.id} action={action} />
            ) : (
              <ActionButton key={action.id} action={action} />
            ),
          )}
        {more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="grid h-8 w-8 place-items-center rounded-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <MenuItems items={more} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </TooltipProvider>
  )
}

function ActionButton({ action }: { action: ToolbarAction }) {
  const Icon = action.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={action.label}
          className="grid h-8 min-w-8 place-items-center rounded-md px-2 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => action.run?.()}
        >
          {Icon ? <Icon className="h-4 w-4" /> : action.label}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {action.label}
        {action.shortcut ? ` · ${action.shortcut}` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

function ActionDropdown({ action }: { action: ToolbarAction }) {
  const Icon = action.icon
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={action.label}
              className="grid h-8 min-w-8 place-items-center rounded-md px-2 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              {Icon ? <Icon className="h-4 w-4" /> : action.label}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{action.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center">
        <MenuItems items={action.menu ?? []} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MenuItems({ items }: { items: MenuItem[] }) {
  return (
    <>
      {items.map((item, index) =>
        item.separator ? (
          <DropdownMenuSeparator key={`separator-${index}`} />
        ) : item.menu ? (
          <DropdownMenuSub key={`${item.label}-${index}`}>
            <DropdownMenuSubTrigger>{item.label}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <MenuItems items={item.menu} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem
            key={`${item.label}-${index}`}
            className={item.destructive ? 'text-destructive focus:text-destructive' : undefined}
            onSelect={() => item.run?.()}
          >
            {item.label}
            {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        ),
      )}
    </>
  )
}

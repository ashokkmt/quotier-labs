import { MoreHorizontal, type LucideIcon } from 'lucide-react'
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
import type { MenuItem } from './ContextMenu'
import { useAnchoredToolbar } from './toolbarPosition'
import type { Bounds } from './geometry'

export type ToolbarAction = {
  id: string
  label: string
  shortcut?: string
  icon?: LucideIcon
  run?: () => void
  menu?: MenuItem[]
}

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
  const { ref, position } = useAnchoredToolbar(bounds, viewport, topClearance)
  const overflow: MenuItem[] = actions.slice(5).map((action) => ({
    label: action.label,
    shortcut: action.shortcut,
    run: action.run,
    menu: action.menu,
  }))
  const menuItems =
    overflow.length && more.length
      ? [...overflow, { separator: true, label: '' }, ...more]
      : [...overflow, ...more]

  return (
    <TooltipProvider delayDuration={450}>
      <div
        ref={ref}
        role="toolbar"
        aria-label="Selection actions"
        data-v5-context-toolbar
        data-v5-editor-chrome
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
        {menuItems.length > 0 && (
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
              <MenuItems items={menuItems} />
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

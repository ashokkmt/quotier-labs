import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MenuItems } from './ContextToolbar'

export type MenuItem = {
  label: string
  shortcut?: string
  destructive?: boolean
  separator?: boolean
  run?: () => void
  menu?: MenuItem[]
}

/** Radix owns collision, keyboard navigation, submenus, dismissal, and focus restoration. */
export function ContextMenu({
  menu,
  onClose,
}: {
  menu: { x: number; y: number; items: MenuItem[] }
  onClose: () => void
}) {
  return (
    <DropdownMenu
      defaultOpen
      onOpenChange={(open) => {
        // Radix requests close while dispatching an item's select event. Deferring the parent
        // unmount by one frame guarantees the selected command runs before the menu
        // disappears (especially in WebView/Chromium builds).
        if (!open) requestAnimationFrame(onClose)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Canvas context menu"
          className="pointer-events-none fixed h-px w-px opacity-0"
          style={{ left: menu.x, top: menu.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-v5-context-menu
        align="start"
        side="bottom"
        sideOffset={0}
        className="min-w-52"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <MenuItems items={menu.items} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

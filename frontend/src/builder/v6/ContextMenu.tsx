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

export type MenuItem = {
  label: string
  shortcut?: string
  destructive?: boolean
  separator?: boolean
  run?: () => void
  menu?: MenuItem[]
}

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
        if (!open) requestAnimationFrame(onClose)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Document context menu"
          className="pointer-events-none fixed h-px w-px opacity-0"
          style={{ left: menu.x, top: menu.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-v6-context-menu
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

function MenuItems({ items }: { items: MenuItem[] }) {
  return items.map((item, index) =>
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
  )
}

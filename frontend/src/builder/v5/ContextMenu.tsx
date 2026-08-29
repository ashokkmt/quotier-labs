import { useEffect, useRef } from 'react'
import { MenuList } from './ContextToolbar'

export type MenuItem = {
  label: string
  shortcut?: string
  destructive?: boolean
  run?: () => void
  menu?: MenuItem[]
}

/** Right-click / three-dot menu; opens at the pointer, closes on outside press or Escape. */
export function ContextMenu({
  menu,
  onClose,
}: {
  menu: { x: number; y: number; items: MenuItem[] }
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])
  return (
    <div
      ref={ref}
      className="fixed z-30"
      style={{
        left: menu.x,
        top: menu.y,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <MenuList
        items={menu.items}
        onClose={() => {
          onClose()
        }}
      />
    </div>
  )
}

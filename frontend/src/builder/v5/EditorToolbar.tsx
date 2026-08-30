import {
  Boxes,
  ChevronDown,
  Circle,
  Hand,
  Image as ImageIcon,
  Minus,
  MoreVertical,
  MousePointer2,
  PanelRightOpen,
  Square,
  Table2,
  Type,
  type LucideIcon,
} from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useV5Session, type V5ShapeVariant, type V5Tool } from './store'
import { useV5EditorUI } from './EditorUIState'

function ToolButton({
  label,
  shortcut,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  shortcut?: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={active}
          aria-label={label}
          tabIndex={active ? 0 : -1}
          className={`grid h-10 w-10 place-items-center rounded-lg text-foreground/75 outline-none transition-colors duration-75 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${
            active ? 'bg-primary text-primary-foreground hover:bg-primary' : ''
          }`}
          onClick={onClick}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut ? ` · ${shortcut}` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

function Separator() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border" />
}

/** Excalidraw-inspired economy with Quotier's document-specific tool inventory. */
export function EditorToolbar({ temporaryHand = false }: { temporaryHand?: boolean }) {
  const session = useV5Session()
  const ui = useV5EditorUI()
  const selectTool = (tool: V5Tool) => session.setTool(tool)
  const selectShape = (variant: V5ShapeVariant) => {
    session.setShapeVariant(variant)
    session.setTool('shape')
  }
  const onRovingKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ]
    if (!buttons.length) return
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : event.key === 'ArrowRight'
            ? (Math.max(current, -1) + 1) % buttons.length
            : (current <= 0 ? buttons.length : current) - 1
    event.preventDefault()
    buttons[index]?.focus()
  }
  const shapeActive = session.tool === 'shape' && session.shapeVariant !== 'line'

  return (
    <TooltipProvider delayDuration={450}>
      <div
        role="toolbar"
        aria-label="Editor tools"
        data-v5-toolbar
        onKeyDown={onRovingKeyDown}
        className="pointer-events-auto absolute left-1/2 top-3 z-20 flex h-12 -translate-x-1/2 items-center gap-0.5 rounded-[13px] border border-border/80 bg-background p-1 shadow-lg"
      >
        <ToolButton
          label="Select"
          shortcut="V"
          icon={MousePointer2}
          active={session.tool === 'select' && !temporaryHand}
          onClick={() => selectTool('select')}
        />
        <ToolButton
          label="Hand"
          shortcut="H / Space"
          icon={Hand}
          active={session.tool === 'hand' || temporaryHand}
          onClick={() => selectTool('hand')}
        />
        <Separator />
        <ToolButton
          label="Text"
          shortcut="T"
          icon={Type}
          active={session.tool === 'text'}
          onClick={() => selectTool('text')}
        />
        <ToolButton
          label="Image"
          shortcut="I"
          icon={ImageIcon}
          active={session.tool === 'image'}
          onClick={() => selectTool('image')}
        />
        <ToolButton
          label="Table"
          shortcut="F"
          icon={Table2}
          active={session.tool === 'table'}
          onClick={() => selectTool('table')}
        />
        <ToolButton
          label="Divider"
          shortcut="L"
          icon={Minus}
          active={session.tool === 'shape' && session.shapeVariant === 'line'}
          onClick={() => selectShape('line')}
        />
        <ToolButton
          label="Widgets"
          icon={Boxes}
          active={ui.drawer === 'widgets'}
          onClick={() => ui.toggleDrawer('widgets')}
        />
        <Separator />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Shapes"
                  aria-pressed={shapeActive}
                  tabIndex={shapeActive ? 0 : -1}
                  className={`flex h-10 min-w-10 items-center justify-center gap-0.5 rounded-lg px-2 text-foreground/75 outline-none transition-colors duration-75 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${shapeActive ? 'bg-primary text-primary-foreground hover:bg-primary' : ''}`}
                >
                  {session.shapeVariant === 'ellipse' && shapeActive ? (
                    <Circle className="h-[18px] w-[18px]" />
                  ) : (
                    <Square className="h-[18px] w-[18px]" />
                  )}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Shapes</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onSelect={() => selectShape('rect')}>
              <Square />
              Rectangle <Shortcut>R</Shortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => selectShape('square')}>
              <Square />
              Square <Shortcut>S</Shortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => selectShape('ellipse')}>
              <Circle />
              Ellipse <Shortcut>O</Shortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More editor actions"
              tabIndex={-1}
              className="grid h-10 w-10 place-items-center rounded-lg text-foreground/75 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreVertical className="h-[18px] w-[18px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => ui.setInspectorOpen(true)}>
              <PanelRightOpen />
              Open properties
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => ui.setDrawer('widgets')}>
              <Boxes />
              Open widgets
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  )
}

function Shortcut({ children }: { children: ReactNode }) {
  return <span className="ml-auto text-xs text-muted-foreground">{children}</span>
}

import { Circle, Hand, Image as ImageIcon, Minus, MousePointer2, Square, Table2, Type } from 'lucide-react'
import { useV5Session, type V5ShapeVariant, type V5Tool } from './store'

type ToolButton = {
  id: string
  label: string
  shortcut: string
  icon: typeof Square
  active: boolean
  activate: () => void
}

const shapeVariantTool = (
  variant: V5ShapeVariant,
  label: string,
  shortcut: string,
  icon: typeof Square,
  session: ReturnType<typeof useV5Session>,
): ToolButton => ({
  id: `shape-${variant}`,
  label,
  shortcut,
  icon,
  active: session.tool === 'shape' && session.shapeVariant === variant,
  activate: () => {
    session.setShapeVariant(variant)
    session.setTool('shape')
  },
})

/** Fixed Figma/Excalidraw-style tool bar; screen-space, never part of the document. */
export function EditorToolbar() {
  const session = useV5Session()
  const simpleTool = (tool: V5Tool, id: string, label: string, shortcut: string, icon: typeof Square): ToolButton => ({
    id,
    label,
    shortcut,
    icon,
    active: session.tool === tool,
    activate: () => session.setTool(tool),
  })
  const tools: ToolButton[] = [
    simpleTool('select', 'select', 'Select', 'V', MousePointer2),
    simpleTool('hand', 'hand', 'Pan', 'H', Hand),
    simpleTool('text', 'text', 'Text', 'T', Type),
    shapeVariantTool('line', 'Line', 'L', Minus, session),
    shapeVariantTool('rect', 'Rectangle', 'R', Square, session),
    shapeVariantTool('ellipse', 'Ellipse', 'O', Circle, session),
    shapeVariantTool('square', 'Square', 'S', Square, session),
    simpleTool('image', 'image', 'Image', 'I', ImageIcon),
    simpleTool('table', 'table', 'Table', 'F', Table2),
  ]
  return (
    <div
      role="toolbar"
      aria-label="Editor tools"
      data-v5-toolbar
      className="flex shrink-0 items-center gap-1 border-b bg-background px-2 py-1.5"
    >
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          aria-pressed={tool.active}
          aria-label={tool.label}
          title={`${tool.label} (${tool.shortcut})`}
          className={`grid h-8 w-8 place-items-center rounded-md text-foreground/80 hover:bg-accent ${
            tool.active ? 'bg-primary text-primary-foreground hover:bg-primary' : ''
          }`}
          onClick={tool.activate}
        >
          <tool.icon className="h-4 w-4" aria-hidden />
        </button>
      ))}
      <p className="ml-3 text-xs text-muted-foreground">
        {session.tool === 'select'
          ? 'Click to select, drag empty space for marquee'
          : session.tool === 'hand'
            ? 'Drag to pan the document'
            : 'Click or drag on the page to place'}
      </p>
    </div>
  )
}

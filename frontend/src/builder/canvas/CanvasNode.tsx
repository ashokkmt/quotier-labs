import { memo } from 'react'
import { useBuilderStore } from '../document/store'
import { getWidget } from '../registry/registry'
import { cn } from '../../lib/utils'

export const CanvasNode = memo(function CanvasNode({ id }: { id: string }) {
  const node = useBuilderStore((s) => s.nodes[id])
  const isHovered = useBuilderStore((s) => s.hoveredNodeId === id)
  const isSelected = useBuilderStore((s) => s.selectedNodeId === id)
  const beginDrag = useBuilderStore((s) => s.setDrag)
  const rootId = useBuilderStore((s) => s.rootId)

  if (!node) return null

  const widget = getWidget(node.widget)
  if (!widget) return <div className="text-red-500">Unknown widget: {node.widget}</div>

  const output = widget.render(node)

  // Base structural classes based on style tokens
  const widthClass =
    node.style.width === 'half'
      ? 'w-1/2'
      : node.style.width === 'third'
        ? 'w-1/3'
        : node.style.width === 'two-thirds'
          ? 'w-2/3'
          : 'w-full'
  const spacingClass =
    node.style.spacing === 'sm'
      ? 'p-2'
      : node.style.spacing === 'lg'
        ? 'p-8'
        : node.style.spacing === 'none'
          ? 'p-0'
          : 'p-4'
  const alignClass =
    node.style.align === 'center'
      ? 'text-center'
      : node.style.align === 'right'
        ? 'text-right'
        : 'text-left'

  // Flex layouts
  const isHorizontal = node.props.direction === 'horizontal'
  const layoutClass =
    output.role === 'container' ? (isHorizontal ? 'flex flex-row flex-wrap' : 'flex flex-col') : ''

  return (
    <div
      data-builder-node={id}
      className={cn(
        'relative group',
        widthClass,
        spacingClass,
        alignClass,
        layoutClass,
        !node.meta.visible && 'opacity-50 grayscale',
      )}
    >
      {(isHovered || isSelected) && id !== rootId && (
        <div
          className="absolute -top-3 -left-3 bg-blue-500 text-white w-6 h-6 flex items-center justify-center rounded cursor-grab z-10"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            e.stopPropagation()
            beginDrag({
              source: { type: 'move', nodeId: id },
              x: e.clientX,
              y: e.clientY,
              resolution: null,
            })
          }}
        >
          ☷
        </div>
      )}

      {output.role === 'content' && (
        <div className="prose prose-sm max-w-none break-words">
          {output.text || (
            <span className="text-muted-foreground opacity-50">Empty {widget.metadata.label}</span>
          )}
        </div>
      )}

      {output.role === 'media' && (
        <div className="bg-muted min-h-[100px] flex items-center justify-center rounded border border-dashed">
          {output.text ? (
            <img src={output.text} alt="" className="max-w-full h-auto" />
          ) : (
            <span className="text-muted-foreground">Image Placeholder</span>
          )}
        </div>
      )}

      {output.role === 'divider' && <hr className="my-4 border-t-2" />}

      {output.role === 'table' && (
        <div className="border rounded p-4 text-center text-muted-foreground bg-muted/20">
          Table Component Placeholder
        </div>
      )}

      {/* Render children for containers */}
      {node.children.map((childId) => (
        <CanvasNode key={childId} id={childId} />
      ))}
    </div>
  )
})

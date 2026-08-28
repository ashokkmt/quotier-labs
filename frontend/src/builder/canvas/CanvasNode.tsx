import { memo } from 'react'
import { useBuilderStore } from '../document/store'
import { getWidget } from '../registry/registry'
import { cn } from '../../lib/utils'

const padding = { none: 'p-0', xs: 'p-1', sm: 'p-2', md: 'p-4', lg: 'p-8' }
const gap = { none: 'gap-0', xs: 'gap-1', sm: 'gap-2', md: 'gap-4', lg: 'gap-8' }

export const CanvasNode = memo(function CanvasNode({ id }: { id: string }) {
  const node = useBuilderStore((state) => state.nodes[id])
  if (!node) return null
  const definition = node.role === 'root' ? undefined : getWidget(node.type)
  const output = definition?.render(node)
  const isContainer = node.role === 'root' || node.role === 'container'
  const horizontal = node.layout.direction === 'horizontal'
  const basis = node.layout.basis ? `${node.layout.basis / 100}%` : undefined
  return (
    <div
      data-builder-node={id}
      className={cn(
        isContainer && 'min-w-0',
        isContainer && (horizontal ? 'flex flex-row flex-wrap' : 'flex flex-col'),
        isContainer && gap[node.layout.gap ?? 'md'],
        isContainer && padding[node.layout.padding ?? 'none'],
        !node.meta.visible && 'opacity-50 grayscale',
        node.role === 'widget' && 'min-w-0',
      )}
      style={{
        flexBasis: basis,
        flexGrow: node.layout.basis ? 0 : 1,
        textAlign: node.layout.textAlign,
      }}
    >
      {output?.role === 'content' && (
        <div className="break-words whitespace-pre-wrap">
          {output.text || (
            <span className="text-muted-foreground">Empty {definition?.metadata.label}</span>
          )}
        </div>
      )}
      {output?.role === 'media' && (
        <div className="min-h-24 border border-dashed rounded flex items-center justify-center overflow-hidden">
          {output.text ? (
            <img src={output.text} alt="" className="max-w-full h-auto" />
          ) : (
            <span className="text-muted-foreground">Image</span>
          )}
        </div>
      )}
      {output?.role === 'divider' && <hr className="w-full border-t" />}
      {output?.role === 'table' && (
        <div className="border rounded p-4 text-muted-foreground">Table</div>
      )}
      {isContainer && node.children.map((child) => <CanvasNode key={child} id={child} />)}
    </div>
  )
})

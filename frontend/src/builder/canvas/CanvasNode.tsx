import { memo } from 'react'
import { useBuilderStore } from '../document/store'
import { getWidget } from '../registry/registry'
import { cn } from '../../lib/utils'

const padding = { none: 'p-0', xs: 'p-1', sm: 'p-2', md: 'p-4', lg: 'p-8' }
const gap = { none: 'gap-0', xs: 'gap-1', sm: 'gap-2', md: 'gap-4', lg: 'gap-8' }
const fontSize = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
}
const fontWeight = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}
const textColor = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-emerald-700',
  danger: 'text-destructive',
}
const lineHeight = { tight: 'leading-tight', normal: 'leading-normal', relaxed: 'leading-relaxed' }
const dividerColor = {
  default: 'border-foreground/40',
  muted: 'border-muted-foreground/35',
  primary: 'border-primary',
  success: 'border-emerald-600',
  danger: 'border-destructive',
}

export const CanvasNode = memo(function CanvasNode({ id }: { id: string }) {
  const node = useBuilderStore((state) => state.nodes[id])
  const parent = useBuilderStore((state) =>
    node?.parentId ? state.nodes[node.parentId] : undefined,
  )
  if (!node) return null
  const definition = node.role === 'root' ? undefined : getWidget(node.type)
  const output = definition?.render(node)
  const isContainer = node.role === 'root' || node.role === 'container'
  const horizontal = node.layout.direction === 'horizontal'
  const isColumn = parent?.layout.direction === 'horizontal'
  const basis = isColumn && node.layout.basis ? `${node.layout.basis / 100}%` : undefined
  return (
    <div
      data-builder-node={id}
      className={cn(
        isContainer && 'min-w-0',
        isContainer && (horizontal ? 'flex flex-row' : 'flex flex-col'),
        isContainer && horizontal && (node.layout.wrap === 'wrap' ? 'flex-wrap' : 'flex-nowrap'),
        isContainer && gap[node.layout.gap ?? 'md'],
        isContainer && padding[node.layout.padding ?? 'none'],
        !node.meta.visible && 'opacity-50 grayscale',
        node.role === 'widget' && 'min-w-0',
        node.role === 'widget' && fontSize[node.layout.fontSize ?? 'md'],
        node.role === 'widget' && fontWeight[node.layout.fontWeight ?? 'normal'],
        node.role === 'widget' && textColor[node.layout.textColor ?? 'default'],
        node.role === 'widget' && lineHeight[node.layout.lineHeight ?? 'normal'],
      )}
      style={{
        flexBasis: basis,
        flexGrow: isColumn && !node.layout.basis ? 1 : 0,
        textAlign: node.layout.textAlign,
        alignItems: node.layout.alignItems,
        justifyContent: node.layout.justifyContent,
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
            <img
              src={output.text}
              alt={String(node.props.alt ?? '')}
              className="h-auto max-w-full"
              style={{
                width: `${Math.max(10, Math.min(100, Number(node.layout.imageWidth ?? 100)))}%`,
                objectFit: node.layout.imageFit ?? 'contain',
              }}
            />
          ) : (
            <span className="text-muted-foreground">Image</span>
          )}
        </div>
      )}
      {output?.role === 'divider' && (
        <div className="min-h-6 flex items-center py-2" aria-label="Divider">
          <hr
            className={cn(
              'w-full border-0 border-t',
              dividerColor[String(node.props.color ?? 'default') as keyof typeof dividerColor] ??
                dividerColor.default,
            )}
            style={{
              borderTopWidth: `${Math.max(1, Math.min(12, Number(node.props.weight ?? 1)))}px`,
            }}
          />
        </div>
      )}
      {node.type === 'spacer' && (
        <div style={{ height: `${Math.max(0, Number(node.props.height ?? 24))}px` }} />
      )}
      {output?.role === 'table' && (
        <div className="border rounded p-4 text-muted-foreground">Table</div>
      )}
      {isContainer && node.children.map((child) => <CanvasNode key={child} id={child} />)}
    </div>
  )
})

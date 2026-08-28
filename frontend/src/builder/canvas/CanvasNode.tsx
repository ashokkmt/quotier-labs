import { memo, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'
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
  const updateProp = useBuilderStore((state) => state.updateProp)
  const [editing, setEditing] = useState(false)
  const [imageSrc, setImageSrc] = useState('')
  const parent = useBuilderStore((state) =>
    node?.parentId ? state.nodes[node.parentId] : undefined,
  )
  const rawImageSource = node ? String(getWidget(node.type)?.render(node).text ?? '') : ''
  const needsManagedImage =
    Boolean(rawImageSource) &&
    !rawImageSource.startsWith('data:') &&
    !rawImageSource.startsWith('http')
  useEffect(() => {
    if (!needsManagedImage) return
    let cancelled = false
    GetImageDataURI(rawImageSource)
      .then((src) => {
        if (!cancelled) setImageSrc(src)
      })
      .catch(() => {
        if (!cancelled) setImageSrc('')
      })
    return () => {
      cancelled = true
    }
  }, [needsManagedImage, rawImageSource])
  if (!node) return null
  const definition = node.role === 'root' ? undefined : getWidget(node.type)
  const output = definition?.render(node)
  const isContainer = node.role === 'root' || node.role === 'container'
  const isEmptyContainer = isContainer && node.children.length === 0
  const horizontal = node.layout.direction === 'horizontal'
  const isColumn = parent?.layout.direction === 'horizontal'
  const canEditInline = node.type.startsWith('field.')
  const renderedImageSource = needsManagedImage ? imageSrc : rawImageSource
  const basis = isColumn && node.layout.basis ? `${node.layout.basis / 100}%` : undefined
  return (
    <div
      data-builder-node={id}
      className={cn(
        isContainer && 'min-w-0',
        node.role === 'root' && 'min-h-[1059px]',
        isEmptyContainer && 'min-h-40 rounded-md border-2 border-dashed border-muted-foreground/25',
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
        <div
          className={cn(
            'break-words whitespace-pre-wrap',
            canEditInline && 'cursor-text outline-none',
          )}
          contentEditable={canEditInline && editing}
          suppressContentEditableWarning
          role={canEditInline ? 'textbox' : undefined}
          tabIndex={canEditInline ? 0 : undefined}
          onDoubleClick={(event) => {
            if (!canEditInline) return
            event.stopPropagation()
            setEditing(true)
            requestAnimationFrame(() => (event.currentTarget as HTMLElement).focus())
          }}
          onBlur={(event) => {
            if (canEditInline && editing) {
              updateProp(id, 'value', event.currentTarget.textContent ?? '')
              setEditing(false)
            }
          }}
          onKeyDown={(event) => {
            if (canEditInline && event.key === 'Escape') (event.currentTarget as HTMLElement).blur()
          }}
        >
          {output.text || (
            <span className="text-muted-foreground">Empty {definition?.metadata.label}</span>
          )}
        </div>
      )}
      {output?.role === 'media' && (
        <div className="min-h-24 border border-dashed rounded flex items-center justify-center overflow-hidden">
          {renderedImageSource ? (
            <img
              src={renderedImageSource}
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
      {isEmptyContainer && (
        <button
          type="button"
          className="flex min-h-36 w-full flex-1 flex-col items-center justify-center gap-2 rounded text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            window.dispatchEvent(
              new CustomEvent('builder:add', {
                detail: { id, x: event.clientX, y: event.clientY },
              }),
            )
          }}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border bg-background shadow-sm">
            <Plus className="h-5 w-5" />
          </span>
          Add content
        </button>
      )}
      {node.role === 'root' && node.children.length > 0 && (
        <button
          type="button"
          className="mx-auto mt-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:border-primary hover:text-primary"
          aria-label="Add content to document"
          onClick={(event) => {
            event.stopPropagation()
            window.dispatchEvent(
              new CustomEvent('builder:add', {
                detail: { id, x: event.clientX, y: event.clientY },
              }),
            )
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  )
})

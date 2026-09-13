import { useEffect, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'

type Dimensions = { width: number; height: number; offsetX: number; offsetY: number }
type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
const clamp = (value: number) => Math.max(100, Math.min(84189, Math.round(value)))

export function ImageNodeView({ node, selected, updateAttributes }: ReactNodeViewProps) {
  const [uri, setURI] = useState('')
  const [failed, setFailed] = useState(false)
  const [drag, setDrag] = useState<Dimensions | null>(null)
  useEffect(() => {
    let active = true
    GetImageDataURI(String(node.attrs.source))
      .then((value) => active && setURI(value))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [node.attrs.source])

  const base = {
    width: Number(node.attrs.width),
    height: Number(node.attrs.height),
    offsetX: Number(node.attrs.offset_x || 0),
    offsetY: Number(node.attrs.offset_y || 0),
  }
  const current = drag ?? base
  const commit = (next: Dimensions) => {
    updateAttributes({
      width: clamp(next.width),
      height: clamp(next.height),
      offset_x: Math.round(next.offsetX),
      offset_y: Math.round(next.offsetY),
    })
    setDrag(null)
  }
  const beginMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selected || node.attrs.positioning !== 'floating') return
    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY, ...base }
    let latest = base
    const move = (pointer: PointerEvent) => {
      latest = {
        ...base,
        offsetX: start.offsetX + (pointer.clientX - start.x) * 75,
        offsetY: start.offsetY + (pointer.clientY - start.y) * 75,
      }
      setDrag(latest)
    }
    const finish = () => {
      commit(latest)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
  }
  const beginResize = (handle: Handle, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const start = { x: event.clientX, y: event.clientY, ...base }
    const ratio = start.height / Math.max(1, start.width)
    let latest = base
    const move = (pointer: PointerEvent) => {
      const x = (pointer.clientX - start.x) * 75
      const y = (pointer.clientY - start.y) * 75
      let width = start.width + (handle.includes('e') ? x : handle.includes('w') ? -x : 0)
      let height = start.height + (handle.includes('s') ? y : handle.includes('n') ? -y : 0)
      if (node.attrs.aspect_lock && handle.length === 2) {
        if (Math.abs(x) >= Math.abs(y)) height = width * ratio
        else width = height / ratio
      }
      latest = {
        width: clamp(width),
        height: clamp(height),
        offsetX:
          start.offsetX + (handle.includes('w') && node.attrs.positioning === 'floating' ? x : 0),
        offsetY:
          start.offsetY + (handle.includes('n') && node.attrs.positioning === 'floating' ? y : 0),
      }
      setDrag(latest)
    }
    const finish = () => {
      commit(latest)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
  }

  return (
    <NodeViewWrapper
      as="figure"
      data-v6-image=""
      contentEditable={false}
      className="relative my-0 inline-flex select-none"
      style={{
        marginTop: `${Number(node.attrs.space_before || 0) / 75}px`,
        marginBottom: `${Number(node.attrs.space_after || 0) / 75}px`,
        marginLeft:
          node.attrs.alignment === 'center' || node.attrs.alignment === 'right'
            ? 'auto'
            : undefined,
        marginRight: node.attrs.alignment === 'center' ? 'auto' : undefined,
        zIndex:
          node.attrs.positioning === 'floating'
            ? node.attrs.layer === 'behind'
              ? 0
              : 2
            : undefined,
      }}
    >
      {failed ? (
        <div
          role="alert"
          className="rounded border border-destructive p-3 text-sm text-destructive"
        >
          Managed image is unavailable.
        </div>
      ) : (
        <div
          className="relative"
          style={{
            width: `${current.width / 75}px`,
            height: `${current.height / 75}px`,
            transform:
              node.attrs.positioning === 'floating'
                ? `translate(${current.offsetX / 75}px, ${current.offsetY / 75}px)`
                : undefined,
            cursor: selected && node.attrs.positioning === 'floating' ? 'move' : undefined,
          }}
          onPointerDown={beginMove}
        >
          <img
            src={uri}
            alt={String(node.attrs.alt || '')}
            className={`h-full w-full object-contain ${selected ? 'ring-2 ring-primary' : ''}`}
            draggable={false}
          />
          {selected &&
            (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as Handle[]).map((handle) => (
              <button
                key={handle}
                type="button"
                aria-label={`Resize image from ${handle}`}
                className={`v6-image-handle v6-image-handle-${handle}`}
                onPointerDown={(event) => beginResize(handle, event)}
              />
            ))}
        </div>
      )}
    </NodeViewWrapper>
  )
}

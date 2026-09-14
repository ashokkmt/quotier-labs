import { useEffect, useMemo, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'

type Dimensions = { width: number; height: number; offsetX: number; offsetY: number }
type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
const clamp = (value: number) => Math.max(100, Math.min(84189, Math.round(value)))
const bounded = (value: unknown) => Math.max(0, Math.min(0.95, Number(value) || 0))

export function ImageNodeView({ node, selected, updateAttributes }: ReactNodeViewProps) {
  const [uri, setURI] = useState('')
  const [failed, setFailed] = useState(false)
  const [drag, setDrag] = useState<Dimensions | null>(null)
  useEffect(() => {
    let active = true
    setFailed(false)
    GetImageDataURI(String(node.attrs.source))
      .then((value) => active && setURI(value))
      .catch(() => active && setFailed(true))
    return () => { active = false }
  }, [node.attrs.source])

  const base = { width: Number(node.attrs.width), height: Number(node.attrs.height), offsetX: Number(node.attrs.offset_x || 0), offsetY: Number(node.attrs.offset_y || 0) }
  const current = drag ?? base
  const layout = String(node.attrs.layout_mode || (node.attrs.positioning === 'floating' ? (node.attrs.layer === 'behind' ? 'behind' : 'front') : 'inline'))
  const floating = layout !== 'inline'
  const crop = useMemo(() => {
    const left = bounded(node.attrs.crop_left)
    const top = bounded(node.attrs.crop_top)
    return { left, top, right: Math.min(bounded(node.attrs.crop_right), 0.99 - left), bottom: Math.min(bounded(node.attrs.crop_bottom), 0.99 - top) }
  }, [node.attrs.crop_bottom, node.attrs.crop_left, node.attrs.crop_right, node.attrs.crop_top])
  const commit = (next: Dimensions) => {
    updateAttributes({ width: clamp(next.width), height: clamp(next.height), offset_x: Math.round(next.offsetX), offset_y: Math.round(next.offsetY) })
    setDrag(null)
  }
  const scaleFor = (element: HTMLElement, width: number) => Math.max(0.1, element.getBoundingClientRect().width / Math.max(1, width / 75))
  const beginMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selected || !floating || event.target !== event.currentTarget) return
    event.preventDefault()
    const scale = scaleFor(event.currentTarget, base.width)
    const start = { x: event.clientX, y: event.clientY, ...base }
    let latest = base
    const move = (pointer: PointerEvent) => {
      latest = { ...base, offsetX: start.offsetX + ((pointer.clientX - start.x) / scale) * 75, offsetY: start.offsetY + ((pointer.clientY - start.y) / scale) * 75 }
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
    const scale = event.currentTarget.parentElement ? scaleFor(event.currentTarget.parentElement, base.width) : 1
    const start = { x: event.clientX, y: event.clientY, ...base }
    const ratio = start.height / Math.max(1, start.width)
    let latest = base
    const move = (pointer: PointerEvent) => {
      const x = ((pointer.clientX - start.x) / scale) * 75
      const y = ((pointer.clientY - start.y) / scale) * 75
      let width = start.width + (handle.includes('e') ? x : handle.includes('w') ? -x : 0)
      let height = start.height + (handle.includes('s') ? y : handle.includes('n') ? -y : 0)
      if (node.attrs.aspect_lock && handle.length === 2) {
        if (Math.abs(x) >= Math.abs(y)) height = width * ratio
        else width = height / ratio
      }
      latest = { width: clamp(width), height: clamp(height), offsetX: start.offsetX + (handle.includes('w') && floating ? x : 0), offsetY: start.offsetY + (handle.includes('n') && floating ? y : 0) }
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
  const imageWidth = `${100 / (1 - crop.left - crop.right)}%`
  const imageHeight = `${100 / (1 - crop.top - crop.bottom)}%`
  return (
    <NodeViewWrapper as="figure" data-v6-image="" data-v6-image-layout={layout} contentEditable={false} className={`v6-image-node my-0 select-none ${layout === 'wrap' ? 'v6-image-wrap' : ''}`} style={{ marginTop: `${Number(node.attrs.space_before || 0) / 75}px`, marginBottom: `${Number(node.attrs.space_after || 0) / 75}px`, marginLeft: node.attrs.alignment === 'center' || node.attrs.alignment === 'right' ? 'auto' : undefined, marginRight: node.attrs.alignment === 'center' ? 'auto' : undefined, zIndex: layout === 'behind' ? 0 : layout === 'front' ? 2 : undefined }}>
      {failed ? <div role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">Managed image is unavailable.</div> : (
        <div className={`v6-image-frame relative overflow-hidden ${selected ? 'v6-image-selected' : ''}`} style={{ width: `${current.width / 75}px`, height: `${current.height / 75}px`, transform: `${floating ? `translate(${current.offsetX / 75}px, ${current.offsetY / 75}px) ` : ''}rotate(${Number(node.attrs.rotation || 0)}deg)`, cursor: selected && floating ? 'move' : undefined }} onPointerDown={beginMove}>
          <img src={uri} alt={String(node.attrs.alt || '')} className="pointer-events-none absolute max-w-none object-cover select-none" style={{ width: imageWidth, height: imageHeight, left: `${-crop.left / (1 - crop.left - crop.right) * 100}%`, top: `${-crop.top / (1 - crop.top - crop.bottom) * 100}%` }} draggable={false} />
          {selected && (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as Handle[]).map((handle) => <button key={handle} type="button" aria-label={`Resize image from ${handle}`} className={`v6-image-handle v6-image-handle-${handle}`} onPointerDown={(event) => beginResize(handle, event)} />)}
        </div>
      )}
    </NodeViewWrapper>
  )
}

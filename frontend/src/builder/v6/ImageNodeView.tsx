import { useEffect, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'

export function ImageNodeView({ node, selected }: ReactNodeViewProps) {
  const [uri, setURI] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    GetImageDataURI(String(node.attrs.source))
      .then((value) => active && setURI(value))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [node.attrs.source])
  return (
    <NodeViewWrapper
      as="figure"
      data-v6-image=""
      className={`my-3 flex ${node.attrs.alignment === 'center' ? 'justify-center' : node.attrs.alignment === 'right' ? 'justify-end' : 'justify-start'}`}
    >
      {failed ? (
        <div
          role="alert"
          className="rounded border border-destructive p-3 text-sm text-destructive"
        >
          Managed image is unavailable.
        </div>
      ) : (
        <img
          src={uri}
          alt={String(node.attrs.alt || '')}
          className={`max-w-full object-contain ${selected ? 'ring-2 ring-primary' : ''}`}
          style={{
            width: `${Number(node.attrs.width) / 75}px`,
            height: `${Number(node.attrs.height) / 75}px`,
          }}
          draggable={false}
        />
      )}
    </NodeViewWrapper>
  )
}

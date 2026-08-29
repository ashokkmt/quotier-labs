import type { V5Document } from './model'
import { useEffect, useRef } from 'react'
import { V5SessionProvider, useV5Session } from './store'
import { V5Canvas } from './Canvas'
import { LayersPanel } from './LayersPanel'

/** Composition boundary for the new engine; callers opt in explicitly while V4 remains default. */
function ChangeBridge({ onChange }: { onChange?: (document: V5Document) => void }) {
  const session = useV5Session()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    onChange?.(session.document)
  }, [onChange, session.document, session.revision])
  return null
}

export function V5BuilderEngine({
  document,
  onChange,
}: {
  document: V5Document
  onChange?: (document: V5Document) => void
}) {
  return (
    <V5SessionProvider initial={document}>
      <ChangeBridge onChange={onChange} />
      <div style={{ display: 'flex', gap: 16 }}>
        <LayersPanel />
        <V5Canvas />
      </div>
    </V5SessionProvider>
  )
}

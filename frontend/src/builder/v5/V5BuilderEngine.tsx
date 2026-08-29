import type { V5Document } from './model'
import { V5SessionProvider } from './store'
import { V5Canvas } from './Canvas'
import { LayersPanel } from './LayersPanel'

/** Composition boundary for the new engine; callers opt in explicitly while V4 remains default. */
export function V5BuilderEngine({ document }: { document: V5Document }) {
  return (
    <V5SessionProvider initial={document}>
      <div style={{ display: 'flex', gap: 16 }}>
        <LayersPanel />
        <V5Canvas />
      </div>
    </V5SessionProvider>
  )
}

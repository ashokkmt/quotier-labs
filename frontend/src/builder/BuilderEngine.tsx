import { useEffect, useRef } from 'react'
import { useBuilderStore } from './document/store'
import { Canvas } from './canvas/Canvas'
import { Inspector } from './inspector/Inspector'
import { getWidget } from './registry/registry'
import { BlockLibraryPanel } from '../features/quotations/components/BlockLibraryPanel'
import type { DocumentModel } from './document/model'

export function BuilderEngine({
  document,
  onChange,
}: {
  document: DocumentModel | null
  onChange: (doc: DocumentModel) => void
}) {
  const store = useBuilderStore()

  // We need a ref to prevent infinite loops when sync happens
  const isSyncingRef = useRef(false)

  // Initialize store when document prop changes
  // Be careful to not cause infinite loops if the store itself triggers onChange
  useEffect(() => {
    if (document && document.nodes !== useBuilderStore.getState().nodes) {
      isSyncingRef.current = true
      useBuilderStore.getState().setDocument(document)
      isSyncingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document])

  // When store changes, notify parent if it's an internal edit
  useEffect(() => {
    const unsub = useBuilderStore.subscribe((state, prevState) => {
      if (!isSyncingRef.current && state.nodes !== prevState.nodes) {
        onChange({ schemaVersion: state.schemaVersion, rootId: state.rootId, nodes: state.nodes })
      }
    })
    return unsub
  }, [onChange])

  if (!document) return null

  return (
    <div className="flex w-full h-full bg-muted/20">
      <BlockLibraryPanel />

      <div className="flex-1 p-8 overflow-y-auto overflow-x-hidden flex justify-center">
        <div className="w-[794px] min-h-[1123px] shrink-0 origin-top">
          <Canvas />
        </div>
      </div>

      <aside className="w-80 shrink-0 border-l bg-background overflow-y-auto">
        <Inspector
          node={store.selectedNodeId ? store.nodes[store.selectedNodeId] : null}
          onUpdate={(key: string, value: unknown) => {
            if (store.selectedNodeId) {
              const node = store.nodes[store.selectedNodeId]
              const widget = getWidget(node.widget)
              const isStyle = widget?.styleSchema.some((s) => s.key === key)
              if (isStyle) {
                store.updateNode(store.selectedNodeId, {
                  style: { ...node.style, [key]: value } as any,
                })
              } else {
                store.updateProp(store.selectedNodeId, key, value)
              }
            }
          }}
        />
      </aside>
    </div>
  )
}

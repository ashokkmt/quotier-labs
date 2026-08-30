import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type V5Drawer = 'widgets' | 'layers' | 'pages' | null
export type PresetInsertRequest = {
  token: number
  presetId: string
  mode: 'click' | 'drop'
  clientX?: number
  clientY?: number
}
export type LibraryDrag = { presetId: string; clientX: number; clientY: number } | null

type EditorUIValue = {
  drawer: V5Drawer
  setDrawer: (drawer: V5Drawer) => void
  toggleDrawer: (drawer: Exclude<V5Drawer, null>) => void
  inspectorOpen: boolean
  setInspectorOpen: (open: boolean) => void
  libraryDrag: LibraryDrag
  setLibraryDrag: (drag: LibraryDrag) => void
  presetInsertRequest: PresetInsertRequest | null
  requestPresetInsert: (request: Omit<PresetInsertRequest, 'token'>) => void
  clearPresetInsertRequest: () => void
}

const EditorUIContext = createContext<EditorUIValue | null>(null)

/** Workspace chrome is temporary editor state. It is deliberately outside V5Document/history. */
export function V5EditorUIProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<V5Drawer>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [libraryDrag, setLibraryDrag] = useState<LibraryDrag>(null)
  const [presetInsertRequest, setPresetInsertRequest] = useState<PresetInsertRequest | null>(null)
  const value = useMemo<EditorUIValue>(
    () => ({
      drawer,
      setDrawer,
      toggleDrawer: (next) => setDrawer((current) => (current === next ? null : next)),
      inspectorOpen,
      setInspectorOpen,
      libraryDrag,
      setLibraryDrag,
      presetInsertRequest,
      requestPresetInsert: (request) =>
        setPresetInsertRequest({ ...request, token: Date.now() + Math.random() }),
      clearPresetInsertRequest: () => setPresetInsertRequest(null),
    }),
    [drawer, inspectorOpen, libraryDrag, presetInsertRequest],
  )
  return <EditorUIContext.Provider value={value}>{children}</EditorUIContext.Provider>
}

export function useV5EditorUI(): EditorUIValue {
  const value = useContext(EditorUIContext)
  if (!value) throw new Error('useV5EditorUI must be used inside V5EditorUIProvider')
  return value
}

import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Loader2 } from 'lucide-react'
import { SelectImage, GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'
import { SaveDOCX } from '../../../wailsjs/go/wails/ExportHandler'
import { useToast } from '@/hooks/use-toast'
import { v6Extensions } from './extensions'
import {
  V6_A4,
  blankStory,
  nodeID,
  normalizeV6Body,
  normalizeV6Story,
  starterV6Styles,
  type V6Asset,
  type V6Document,
  type V6Settings,
  type V6StoryKey,
} from './model'
import { Toolbar } from './Toolbar'
import { generateV6Docx } from './docx'
import { loadDocumentFonts } from '../v5/documentFonts'
import { DocumentSettingsPanel } from './DocumentSettingsPanel'
import { TableControls } from './TableControls'
import { ContextMenu, type MenuItem } from '../v5/ContextMenu'

export type V6EngineHandle = {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}
type PageMap = {
  pageWidth: number
  pageHeight: number
  pageCount: number
  ranges: unknown[]
  diagnostics: Array<{ code: string; nodeId: string; message: string }>
}

export function V6BuilderEngine({
  document,
  onChange,
  onReady,
  resolvePageMap,
  exportName = 'quotation',
}: {
  document: V6Document
  onChange: (document: V6Document) => void
  onReady?: (handle: V6EngineHandle | null) => void
  resolvePageMap?: (document: V6Document) => Promise<PageMap>
  exportName?: string
}) {
  const [settings, setSettings] = useState<V6Settings>(document.settings)
  const [assets, setAssets] = useState<V6Asset[]>(document.assets ?? [])
  const [stories, setStories] = useState<Record<V6StoryKey, any>>(() => ({
    header_story: document.header_story ?? blankStory(),
    footer_story: document.footer_story ?? blankStory(),
    first_page_header_story: document.first_page_header_story ?? blankStory(),
    first_page_footer_story: document.first_page_footer_story ?? blankStory(),
  }))
  const [pageMap, setPageMap] = useState<PageMap | null>(null)
  const [pageMapFailed, setPageMapFailed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: MenuItem[]
  } | null>(null)
  const settingsRef = useRef(settings)
  const assetsRef = useRef(assets)
  const storiesRef = useRef(stories)
  const latestRef = useRef(document)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    settingsRef.current = settings
    assetsRef.current = assets
    storiesRef.current = stories
    latestRef.current = document
  }, [settings, assets, stories, document])

  useEffect(() => {
    loadDocumentFonts().catch((error) =>
      toast({
        title: 'Document fonts unavailable',
        description: String(error),
        variant: 'destructive',
      }),
    )
  }, [toast])

  const emit = (
    body: any,
    nextSettings = settingsRef.current,
    nextAssets = assetsRef.current,
    nextStories = storiesRef.current,
  ) => {
    const next: V6Document = {
      schema_version: 6,
      settings: nextSettings,
      styles: document.styles?.length ? document.styles : starterV6Styles(),
      body: normalizeV6Body(body),
      assets: nextAssets,
      ...nextStories,
    }
    latestRef.current = next
    onChange(next)
  }
  const editor = useEditor({
    extensions: v6Extensions,
    content: document.body,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: 'v6-prosemirror min-h-[850px] outline-none',
        'aria-label': 'Quotation document',
      },
    },
    onUpdate: ({ editor }) => {
      setRevision((value) => value + 1)
      emit(editor.getJSON())
    },
    onSelectionUpdate: () => setRevision((value) => value + 1),
  })

  useEffect(() => {
    if (!editor) return
    const handle: V6EngineHandle = {
      undo: () => editor.chain().focus().undo().run(),
      redo: () => editor.chain().focus().redo().run(),
      canUndo: () => editor.can().undo(),
      canRedo: () => editor.can().redo(),
    }
    onReady?.(handle)
    return () => onReady?.(null)
  }, [editor, onReady])

  useEffect(() => {
    if (!editor || !resolvePageMap) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const current = {
        ...latestRef.current,
        body: normalizeV6Body(editor.getJSON()),
        settings: settingsRef.current,
        assets: assetsRef.current,
        ...storiesRef.current,
      }
      resolvePageMap(current)
        .then((map) => {
          if (!controller.signal.aborted) {
            setPageMap(map)
            setPageMapFailed(false)
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setPageMapFailed(true)
        })
    }, 350)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [editor, resolvePageMap, revision, settings, assets, stories])

  if (!editor)
    return (
      <div className="flex h-full items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin" /> Loading editor…
      </div>
    )
  const updateSettings = (next: V6Settings) => {
    setSettings(next)
    emit(editor.getJSON(), next, assetsRef.current)
  }
  const updateStory = (key: V6StoryKey, story: any) => {
    const nextStories = { ...storiesRef.current, [key]: normalizeV6Story(story) }
    storiesRef.current = nextStories
    setStories(nextStories)
    emit(editor.getJSON(), settingsRef.current, assetsRef.current, nextStories)
  }
  const insertImage = async () => {
    try {
      const source = await SelectImage('Insert managed image')
      if (!source) return
      const uri = await GetImageDataURI(source)
      const dimensions = await imageDimensions(uri)
      const maxWidth = 36000
      const width = Math.min(maxWidth, Math.round(dimensions.width * 75))
      const height = Math.max(100, Math.round((width * dimensions.height) / dimensions.width))
      const nextAssets = [
        ...assetsRef.current.filter((asset) => asset.source !== source),
        { source, pixel_width: dimensions.width, pixel_height: dimensions.height },
      ]
      setAssets(nextAssets)
      assetsRef.current = nextAssets
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'imageBlock',
          attrs: {
            id: nodeID(),
            source,
            width,
            height,
            pixel_width: dimensions.width,
            pixel_height: dimensions.height,
            alignment: 'left',
            alt: '',
          },
        })
        .run()
    } catch (error) {
      toast({ title: 'Could not insert image', description: String(error), variant: 'destructive' })
    }
  }
  const exportDOCX = async () => {
    try {
      const current = {
        ...latestRef.current,
        body: normalizeV6Body(editor.getJSON()),
        settings,
        assets,
        ...stories,
      }
      const buffer = await generateV6Docx(current)
      const encoded = bytesToBase64(new Uint8Array(buffer))
      const path = await SaveDOCX(encoded, `${safeName(exportName)}.docx`)
      if (path) toast({ title: 'DOCX saved', description: path })
    } catch (error) {
      toast({ title: 'DOCX export failed', description: String(error), variant: 'destructive' })
    }
  }
  const pageWidth = (settings.orientation === 'portrait' ? V6_A4.width : V6_A4.height) / 75
  const pageHeight = (settings.orientation === 'portrait' ? V6_A4.height : V6_A4.width) / 75
  const count = Math.max(1, pageMap?.pageCount ?? 1)
  const openContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    const edit = (command: 'copy' | 'cut') => {
      editor.view.focus()
      window.document.execCommand(command)
    }
    const items: MenuItem[] = [
      { label: 'Cut', shortcut: '⌘X', run: () => edit('cut') },
      { label: 'Copy', shortcut: '⌘C', run: () => edit('copy') },
      {
        label: 'Paste as text',
        shortcut: '⌘⇧V',
        run: () =>
          void navigator.clipboard
            ?.readText()
            .then((text) => editor.chain().focus().insertContent(text).run())
            .catch(() => undefined),
      },
      { separator: true, label: '' },
      { label: 'Select all', shortcut: '⌘A', run: () => editor.chain().focus().selectAll().run() },
      {
        label: 'Formatting',
        menu: [
          { label: 'Bold', shortcut: '⌘B', run: () => editor.chain().focus().toggleBold().run() },
          {
            label: 'Italic',
            shortcut: '⌘I',
            run: () => editor.chain().focus().toggleItalic().run(),
          },
          {
            label: 'Underline',
            shortcut: '⌘U',
            run: () => editor.chain().focus().toggleUnderline().run(),
          },
        ],
      },
    ]
    setContextMenu({ x: event.clientX, y: event.clientY, items })
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/40">
      <Toolbar
        editor={editor}
        document={{ ...document, settings, assets, ...stories }}
        onInsertImage={() => void insertImage()}
        onExportDOCX={() => void exportDOCX()}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <DocumentSettingsPanel
        open={settingsOpen}
        settings={settings}
        stories={stories}
        pageCount={count}
        pageMapFailed={pageMapFailed}
        onOpenChange={setSettingsOpen}
        onSettingsChange={updateSettings}
        onStoryChange={updateStory}
      />
      <div className="v6-editor-scroller min-h-0 flex-1 overflow-auto p-6">
        <div
          className="relative mx-auto bg-white text-gray-950 shadow-xl"
          style={{
            width: pageWidth,
            minHeight: pageHeight * count,
            backgroundImage:
              count > 1
                ? `repeating-linear-gradient(to bottom, white 0, white ${pageHeight - 12}px, #cbd5e1 ${pageHeight - 12}px, #cbd5e1 ${pageHeight}px)`
                : undefined,
          }}
        >
          <div
            ref={surfaceRef}
            className="relative"
            style={{
              padding: `${settings.margins.top / 75}px ${settings.margins.right / 75}px ${settings.margins.bottom / 75}px ${settings.margins.left / 75}px`,
            }}
          >
            <div onContextMenu={openContextMenu}>
              <EditorContent editor={editor} />
            </div>
            <TableControls
              editor={editor}
              document={{ ...document, settings, assets, ...stories }}
              surfaceRef={surfaceRef}
            />
            {contextMenu && <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
          </div>
        </div>
      </div>
    </div>
  )
}

const imageDimensions = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = src
  })
const safeName = (value: string) =>
  value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'quotation'
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Loader2 } from 'lucide-react'
import { SelectImage, GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'
import { SaveDOCX } from '../../../wailsjs/go/wails/ExportHandler'
import { useToast } from '@/hooks/use-toast'
import { v6Extensions } from './extensions'
import {
  V6_A4,
  nodeID,
  normalizeV6Body,
  type V6Asset,
  type V6Document,
  type V6Settings,
} from './model'
import { Toolbar } from './Toolbar'
import { Ruler } from './Ruler'
import { generateV6Docx } from './docx'
import { loadDocumentFonts } from '../v5/documentFonts'

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
  const [pageMap, setPageMap] = useState<PageMap | null>(null)
  const [pageMapFailed, setPageMapFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const settingsRef = useRef(settings)
  const assetsRef = useRef(assets)
  const latestRef = useRef(document)
  const { toast } = useToast()

  useEffect(() => {
    settingsRef.current = settings
    assetsRef.current = assets
    latestRef.current = document
  }, [settings, assets, document])

  useEffect(() => {
    loadDocumentFonts().catch((error) =>
      toast({
        title: 'Document fonts unavailable',
        description: String(error),
        variant: 'destructive',
      }),
    )
  }, [toast])

  const emit = (body: any, nextSettings = settingsRef.current, nextAssets = assetsRef.current) => {
    const next: V6Document = {
      schema_version: 6,
      settings: nextSettings,
      body: normalizeV6Body(body),
      assets: nextAssets,
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
  }, [editor, resolvePageMap, revision, settings, assets])

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
      }
      const buffer = await generateV6Docx(current)
      const encoded = bytesToBase64(new Uint8Array(buffer))
      const path = await SaveDOCX(encoded, `${safeName(exportName)}.docx`)
      if (path) toast({ title: 'DOCX saved', description: path })
    } catch (error) {
      toast({ title: 'DOCX export failed', description: String(error), variant: 'destructive' })
    }
  }
  const paragraph = editor.getAttributes('paragraph')
  const pageWidth = (settings.orientation === 'portrait' ? V6_A4.width : V6_A4.height) / 75
  const pageHeight = (settings.orientation === 'portrait' ? V6_A4.height : V6_A4.width) / 75
  const count = Math.max(1, pageMap?.pageCount ?? 1)
  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/40">
      <Toolbar
        editor={editor}
        document={{ ...document, settings, assets }}
        onInsertImage={() => void insertImage()}
        onExportDOCX={() => void exportDOCX()}
      />
      <Ruler
        values={paragraph}
        onChange={(name, value) =>
          editor
            .chain()
            .focus()
            .updateAttributes('paragraph', { [name]: value })
            .run()
        }
      />
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-3 py-2 text-xs">
        <label>
          Orientation{' '}
          <select
            className="ml-1 rounded border bg-background p-1"
            value={settings.orientation}
            onChange={(e) =>
              updateSettings({
                ...settings,
                orientation: e.target.value as V6Settings['orientation'],
              })
            }
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <label key={side}>
            {side} margin{' '}
            <input
              aria-label={`${side} margin in millimetres`}
              className="ml-1 w-14 rounded border bg-background p-1"
              type="number"
              min={5}
              max={80}
              value={Math.round(settings.margins[side] / 283.465)}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  margins: {
                    ...settings.margins,
                    [side]: Math.round(Number(e.target.value) * 283.465),
                  },
                })
              }
            />
          </label>
        ))}
        <span
          role="status"
          className={pageMapFailed ? 'text-destructive' : 'text-muted-foreground'}
        >
          {pageMapFailed
            ? 'Page layout unavailable — retrying'
            : `${count} page${count === 1 ? '' : 's'} · PDF-authoritative layout`}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
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
            style={{
              padding: `${settings.margins.top / 75}px ${settings.margins.right / 75}px ${settings.margins.bottom / 75}px ${settings.margins.left / 75}px`,
            }}
          >
            <EditorContent editor={editor} />
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

import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Loader2 } from 'lucide-react'
import {
  SelectImage,
  GetImageDataURI,
  GetActiveCompany,
} from '../../../wailsjs/go/wails/CompanyHandler'
import { GetCustomer } from '../../../wailsjs/go/wails/CustomerHandler'
import { SaveDOCX } from '../../../wailsjs/go/wails/ExportHandler'
import { RecalculateQuotation } from '../../../wailsjs/go/wails/QuotationHandler'
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
import { generateV6DocxPackage } from './docx'
import { loadDocumentFonts } from '../v5/documentFonts'
import { DocumentSettingsPanel } from './DocumentSettingsPanel'
import { TableControls } from './TableControls'
import { ContextMenu, type MenuItem } from '../v5/ContextMenu'
import { ImageInspector } from './ImageInspector'

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
  quotationContext,
  prepareExport,
}: {
  document: V6Document
  onChange: (document: V6Document) => void
  onReady?: (handle: V6EngineHandle | null) => void
  resolvePageMap?: (document: V6Document) => Promise<PageMap>
  exportName?: string
  quotationContext?: any
  prepareExport?: (document: V6Document) => Promise<any>
}) {
  const [settings, setSettings] = useState<V6Settings>(document.settings)
  const [exportingDOCX, setExportingDOCX] = useState(false)
  const docxAbortRef = useRef<AbortController | null>(null)
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
  const [settingsTab, setSettingsTab] = useState<'document' | 'stories'>('document')
  const [revision, setRevision] = useState(0)
  const [imageSelected, setImageSelected] = useState(false)
  const [zoom, setZoom] = useState(1)
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

  useEffect(() => () => docxAbortRef.current?.abort(), [])

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
        class: 'v6-prosemirror outline-none',
        'aria-label': 'Quotation document',
      },
    },
    onUpdate: ({ editor }) => {
      setRevision((value) => value + 1)
      emit(editor.getJSON())
    },
    onSelectionUpdate: ({ editor }) => {
      setRevision((value) => value + 1)
      setImageSelected(editor.isActive('imageBlock'))
    },
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
  const selectManagedImage = async (replace = false) => {
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
      const attrs = {
        ...(replace ? editor.getAttributes('imageBlock') : {}),
        id: replace ? editor.getAttributes('imageBlock').id : nodeID(),
        source,
        width,
        height,
        pixel_width: dimensions.width,
        pixel_height: dimensions.height,
        alignment: replace ? editor.getAttributes('imageBlock').alignment : 'left',
        alt: replace ? editor.getAttributes('imageBlock').alt : '',
        aspect_lock: replace ? Boolean(editor.getAttributes('imageBlock').aspect_lock) : true,
      }
      const chain = editor.chain().focus()
      if (replace && editor.isActive('imageBlock'))
        chain.updateAttributes('imageBlock', attrs).run()
      else chain.insertContent({ type: 'imageBlock', attrs }).run()
    } catch (error) {
      toast({ title: 'Could not insert image', description: String(error), variant: 'destructive' })
    }
  }
  const exportDOCX = async () => {
    if (exportingDOCX) return
    const controller = new AbortController()
    docxAbortRef.current?.abort()
    docxAbortRef.current = controller
    setExportingDOCX(true)
    try {
      const current = {
        ...latestRef.current,
        body: normalizeV6Body(editor.getJSON()),
        settings,
        assets,
        ...stories,
      }
      const authoritativeQuotation = prepareExport ? await prepareExport(current) : quotationContext
      const company = authoritativeQuotation ? await GetActiveCompany() : null
      const customer = authoritativeQuotation?.customer_id
        ? await GetCustomer(authoritativeQuotation.customer_id)
        : null
      const calculation = authoritativeQuotation?.id
        ? await RecalculateQuotation(authoritativeQuotation.id)
        : null
      const { buffer, warnings } = await generateV6DocxPackage(
        current,
        fieldValues(company, customer, authoritativeQuotation, calculation),
        controller.signal,
      )
      const encoded = bytesToBase64(new Uint8Array(buffer))
      const path = await SaveDOCX(encoded, `${safeName(exportName)}.docx`)
      if (path)
        toast({
          title: warnings.length
            ? `DOCX saved with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
            : 'DOCX saved',
          description: warnings.length
            ? warnings.map((warning) => warning.message).join(' ')
            : path,
        })
    } catch (error) {
      if (!controller.signal.aborted)
        toast({ title: 'DOCX export failed', description: String(error), variant: 'destructive' })
    } finally {
      if (!controller.signal.aborted) setExportingDOCX(false)
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
        onInsertImage={() => void selectManagedImage()}
        onReplaceImage={() => void selectManagedImage(true)}
        onExportDOCX={() => void exportDOCX()}
        exportingDOCX={exportingDOCX}
        onOpenSettings={() => {
          setSettingsTab('document')
          setSettingsOpen(true)
        }}
        onOpenHeaders={() => {
          setSettingsTab('stories')
          setSettingsOpen(true)
        }}
        zoom={zoom}
        onZoom={(value) => setZoom(Math.max(0.5, Math.min(1.5, Math.round(value * 10) / 10)))}
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
        tab={settingsTab}
        onTabChange={setSettingsTab}
      />
      <div className="v6-editor-scroller min-h-0 flex-1 overflow-auto p-6">
        <div
          className="relative mx-auto bg-white text-gray-950 shadow-xl"
          style={{
            width: pageWidth,
            minHeight: pageHeight * count,
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            marginBottom: `${(zoom - 1) * pageHeight * count}px`,
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
            onPointerDown={(event) => {
              if (!(event.target instanceof Element) || event.target.closest('[data-v6-image]'))
                return
              if (editor.isActive('imageBlock'))
                editor.commands.setTextSelection(Math.max(1, editor.state.selection.from - 1))
              setImageSelected(false)
            }}
          >
            <div onContextMenu={openContextMenu}>
              <EditorContent editor={editor} />
            </div>
            <TableControls editor={editor} surfaceRef={surfaceRef} />
            {contextMenu && <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
          </div>
        </div>
        {imageSelected && (
          <ImageInspector editor={editor} onReplace={() => void selectManagedImage(true)} />
        )}
      </div>
    </div>
  )
}

function fieldValues(
  company: any,
  customer: any,
  quotation: any,
  calculation?: any,
): Record<string, string> {
  const values: Record<string, string> = {}
  const add = (prefix: string, source: any, keys: string[]) => {
    for (const key of keys)
      if (source?.[key] !== null && source?.[key] !== undefined)
        values[`${prefix}.${key}`] = String(source[key])
  }
  add('company', company, [
    'name',
    'legal_name',
    'address',
    'phone',
    'email',
    'website',
    'gstin',
    'pan',
  ])
  add('customer', customer, [
    'name',
    'company_name',
    'contact_person',
    'address',
    'billing_address',
    'shipping_address',
    'phone',
    'email',
    'gstin',
    'pan',
    'state',
    'country',
  ])
  add('quotation', quotation, ['number'])
  if (quotation?.created_at)
    values['quotation.date'] = new Date(quotation.created_at).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  if (quotation?.valid_until)
    values['quotation.valid_until'] = new Date(quotation.valid_until).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  for (const key of [
    'subtotal',
    'discount_total',
    'taxable_total',
    'cgst_total',
    'sgst_total',
    'igst_total',
    'grand_total',
  ]) {
    if (quotation?.[key] !== undefined)
      values[`quotation.${key}`] = `₹${(Number(quotation[key]) / 100).toFixed(2)}`
  }
  for (const line of calculation?.line_items ?? []) {
    values[`line_item.${line.id}.taxable`] = money(Number(line.taxable))
    values[`line_item.${line.id}.tax`] = money(
      Number(line.cgst) + Number(line.sgst) + Number(line.igst),
    )
    values[`line_item.${line.id}.amount`] = money(Number(line.grand_total))
  }
  return values
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
const money = (minor: number) => `₹${(minor / 100).toFixed(2)}`

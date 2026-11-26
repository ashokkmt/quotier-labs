import type { JSONContent } from '@tiptap/react'

export const V6_SCHEMA_VERSION = 6
export const V6_A4 = { width: 59528, height: 84189 }
export const V6_EMPTY_ROW_MIN_HEIGHT = 2400
export const clampV6RowMinHeight = (value: number) =>
  Math.max(V6_EMPTY_ROW_MIN_HEIGHT, Math.min(V6_A4.height, Math.round(value)))
export const V6_TABLE_TRACK_MIN = 3600
export const clampV6TableTrack = (value: number) =>
  Math.max(V6_TABLE_TRACK_MIN, Math.min(V6_A4.height, Math.round(value)))

export type V6Asset = { source: string; pixel_width: number; pixel_height: number }
export const V6_FIELD_KEYS = [
  'company.name',
  'company.legal_name',
  'company.address',
  'company.phone',
  'company.email',
  'company.website',
  'company.gstin',
  'company.pan',
  'customer.name',
  'customer.company_name',
  'customer.contact_person',
  'customer.address',
  'customer.billing_address',
  'customer.shipping_address',
  'customer.phone',
  'customer.email',
  'customer.gstin',
  'customer.pan',
  'customer.state',
  'customer.country',
  'quotation.number',
  'quotation.date',
  'quotation.valid_until',
  'quotation.subtotal',
  'quotation.discount_total',
  'quotation.taxable_total',
  'quotation.cgst_total',
  'quotation.sgst_total',
  'quotation.igst_total',
  'quotation.grand_total',
] as const
export type V6FieldKey = (typeof V6_FIELD_KEYS)[number]
export const V6_LINE_ITEM_COLUMNS = [
  'description',
  'quantity',
  'rate',
  'discount',
  'tax_rate',
  'taxable',
  'tax',
  'amount',
] as const
export type V6Settings = {
  page_size: 'A4'
  orientation: 'portrait' | 'landscape'
  margins: { top: number; right: number; bottom: number; left: number }
  different_first_page?: boolean
}
export type V6Style = {
  name: V6StyleName
  font_family: 'Quotier Sans' | 'Quotier Serif' | 'Quotier Mono'
  font_size: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color: string
  highlight?: string
  alignment: 'left' | 'center' | 'right' | 'justify'
  spacing_before?: number
  spacing_after?: number
  line_height: number
  left_indent?: number
  right_indent?: number
}
export const V6_STYLE_NAMES = [
  'Normal',
  'Title',
  'Heading 1',
  'Heading 2',
  'Body',
  'Terms',
  'Table Header',
  'Table Body',
  'Total',
] as const
export type V6StyleName = (typeof V6_STYLE_NAMES)[number]
export type V6StoryKey =
  'header_story' | 'footer_story' | 'first_page_header_story' | 'first_page_footer_story'
export type V6Document = {
  schema_version: 6
  settings: V6Settings
  styles?: V6Style[]
  body: JSONContent
  header_story?: JSONContent
  footer_story?: JSONContent
  first_page_header_story?: JSONContent
  first_page_footer_story?: JSONContent
  assets: V6Asset[]
}

export const nodeID = () => crypto.randomUUID()
export const clampV6Indent = (value: number) => Math.max(0, Math.min(14400, Math.round(value)))
export const isSafeV6Link = (value: string) => {
  try {
    const parsed = new URL(value.trim())
    return (
      ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname)) ||
      (parsed.protocol === 'mailto:' && Boolean(parsed.pathname))
    )
  } catch {
    return false
  }
}

export function createBlankV6Document(): V6Document {
  return {
    schema_version: V6_SCHEMA_VERSION,
    settings: {
      page_size: 'A4',
      orientation: 'portrait',
      margins: { top: 7200, right: 7200, bottom: 7200, left: 7200 },
    },
    styles: starterV6Styles(),
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: nodeID() }, content: [] }],
    },
    header_story: blankStory(),
    footer_story: blankStory(),
    assets: [],
  }
}

export const blankStory = (): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { id: nodeID(), style: 'Normal' } }],
})

export const starterV6Styles = (): V6Style[] => [
  {
    name: 'Normal',
    font_family: 'Quotier Sans',
    font_size: 1000,
    color: '#111827',
    alignment: 'left',
    line_height: 1.2,
  },
  {
    name: 'Title',
    font_family: 'Quotier Sans',
    font_size: 2400,
    bold: true,
    color: '#111827',
    alignment: 'center',
    spacing_after: 1200,
    line_height: 1.2,
  },
  {
    name: 'Heading 1',
    font_family: 'Quotier Sans',
    font_size: 1800,
    bold: true,
    color: '#111827',
    alignment: 'left',
    spacing_before: 800,
    spacing_after: 600,
    line_height: 1.2,
  },
  {
    name: 'Heading 2',
    font_family: 'Quotier Sans',
    font_size: 1400,
    bold: true,
    color: '#111827',
    alignment: 'left',
    spacing_before: 600,
    spacing_after: 400,
    line_height: 1.2,
  },
  {
    name: 'Body',
    font_family: 'Quotier Sans',
    font_size: 1000,
    color: '#111827',
    alignment: 'left',
    spacing_after: 600,
    line_height: 1.2,
  },
  {
    name: 'Terms',
    font_family: 'Quotier Serif',
    font_size: 900,
    color: '#374151',
    alignment: 'justify',
    spacing_after: 400,
    line_height: 1.2,
  },
  {
    name: 'Table Header',
    font_family: 'Quotier Sans',
    font_size: 800,
    bold: true,
    color: '#111827',
    alignment: 'left',
    line_height: 1.1,
  },
  {
    name: 'Table Body',
    font_family: 'Quotier Sans',
    font_size: 800,
    color: '#111827',
    alignment: 'left',
    line_height: 1.1,
  },
  {
    name: 'Total',
    font_family: 'Quotier Sans',
    font_size: 1000,
    bold: true,
    color: '#111827',
    alignment: 'right',
    spacing_before: 400,
    line_height: 1.2,
  },
]

export function v6Style(document: V6Document, name: string): V6Style {
  return (
    document.styles?.find((style) => style.name === name) ??
    starterV6Styles().find((style) => style.name === name) ??
    starterV6Styles()[0]
  )
}

export function isV6Document(value: unknown): value is V6Document {
  const doc = value as V6Document
  return Boolean(doc && doc.schema_version === 6 && doc.body?.type === 'doc')
}

// Tiptap stores resized columns in first-row cell colwidth values. The backend contract keeps a
// table-level physical-width vector, so derive it once at the persistence boundary.
export function normalizeV6Body(body: JSONContent): JSONContent {
  const ids = new Set<string>()
  const uniqueID = (value: unknown) => {
    const id = typeof value === 'string' ? value : ''
    if (id && !ids.has(id)) {
      ids.add(id)
      return id
    }
    const next = nodeID()
    ids.add(next)
    return next
  }
  const nodeWithID = new Set([
    'paragraph',
    'table',
    'imageBlock',
    'pageBreak',
    'lineItemTable',
    'bulletList',
    'orderedList',
    'listItem',
    'horizontalRule',
    'field',
  ])
  const visit = (node: JSONContent): JSONContent => {
    const content = node.content?.map(visit)
    const attrs = nodeWithID.has(node.type ?? '')
      ? { ...node.attrs, id: uniqueID(node.attrs?.id) }
      : node.attrs
    if (node.type !== 'table')
      return {
        ...node,
        ...(attrs
          ? {
              attrs:
                node.type === 'imageBlock'
                  ? {
                      id: attrs.id,
                      source: String(node.attrs?.source || ''),
                      width: Number(node.attrs?.width || 18000),
                      height: Number(node.attrs?.height || 10000),
                      pixel_width: Number(node.attrs?.pixel_width || 1),
                      pixel_height: Number(node.attrs?.pixel_height || 1),
                      alignment: node.attrs?.alignment || 'left',
                      alt: String(node.attrs?.alt || ''),
                      aspect_lock: Boolean(node.attrs?.aspect_lock),
                      space_before: Number(node.attrs?.space_before || 0),
                      space_after: Number(node.attrs?.space_after || 0),
                      positioning:
                        node.attrs?.positioning ||
                        (node.attrs?.layout_mode && node.attrs.layout_mode !== 'inline'
                          ? 'floating'
                          : 'inline'),
                      offset_x: Number(node.attrs?.offset_x || 0),
                      offset_y: Number(node.attrs?.offset_y || 0),
                      layer:
                        node.attrs?.layer ||
                        (node.attrs?.layout_mode === 'behind' ? 'behind' : 'front'),
                      layout_mode: node.attrs?.layout_mode ||
                        (node.attrs?.positioning === 'floating'
                          ? node.attrs?.layer === 'behind'
                            ? 'behind'
                            : 'front'
                          : 'inline'),
                      position_mode: node.attrs?.position_mode || 'move_with_text',
                      wrap_margin: Number(node.attrs?.wrap_margin || 0),
                      crop_left: Number(node.attrs?.crop_left || 0),
                      crop_top: Number(node.attrs?.crop_top || 0),
                      crop_right: Number(node.attrs?.crop_right || 0),
                      crop_bottom: Number(node.attrs?.crop_bottom || 0),
                      rotation: Number(node.attrs?.rotation || 0),
                    }
                  : attrs,
            }
          : {}),
        ...(content ? { content } : {}),
      }
    const rows = content?.map((row) => ({
      ...row,
      attrs: {
        min_height: Number(row.attrs?.min_height || 0),
        keep_together: Boolean(row.attrs?.keep_together),
      },
      content: row.content?.map((cell) => ({
        ...cell,
        attrs: {
          colspan: Number(cell.attrs?.colspan || 1),
          rowspan: Number(cell.attrs?.rowspan || 1),
          colwidth: Array.isArray(cell.attrs?.colwidth)
            ? cell.attrs.colwidth.map(Number).filter((value) => value > 0)
            : [],
          background: cell.attrs?.background || 'transparent',
          alignment: cell.attrs?.alignment || 'left',
          vertical_alignment: cell.attrs?.vertical_alignment || 'top',
          padding: Number(cell.attrs?.padding || 425),
          border_top: cell.attrs?.border_top || null,
          border_right: cell.attrs?.border_right || null,
          border_bottom: cell.attrs?.border_bottom || null,
          border_left: cell.attrs?.border_left || null,
        },
      })),
    }))
    const firstRow = rows?.[0]?.content ?? []
    const stored = Array.isArray(node.attrs?.column_widths)
      ? node.attrs.column_widths.map(Number)
      : []
    const columns = firstRow.reduce((sum, cell) => sum + Number(cell.attrs?.colspan || 1), 0)
    const widths = firstRow.flatMap((cell) => {
      const span = Number(cell.attrs?.colspan || 1)
      const values = Array.isArray(cell.attrs?.colwidth) ? cell.attrs.colwidth.map(Number) : []
      return Array.from({ length: span }, (_, index) => {
        const px = values[index]
        const storedIndex =
          firstRow
            .slice(0, firstRow.indexOf(cell))
            .reduce((sum, item) => sum + Number(item.attrs?.colspan || 1), 0) + index
        return px > 0
          ? Math.round(px * 75)
          : Number(stored[storedIndex] || Math.floor(45128 / Math.max(1, columns)))
      })
    })
    const headerRows =
      content?.findIndex((row) => row.content?.some((cell) => cell.type !== 'tableHeader')) ?? 0
    const explicit = Array.isArray(node.attrs?.column_widths)
      ? node.attrs.column_widths.map((value: unknown) => clampV6TableTrack(Number(value)))
      : []
    const physicalWidths = explicit.length === widths.length ? explicit : widths.map(clampV6TableTrack)
    return {
      ...node,
      attrs: {
        ...attrs,
        column_widths: physicalWidths,
        width: physicalWidths.reduce((sum, value) => sum + value, 0),
        alignment: node.attrs?.alignment || 'left',
        border_preset: node.attrs?.border_preset || 'all',
        border_color: node.attrs?.border_color || '#D1D5DB',
        cell_padding: Number(node.attrs?.cell_padding || 425),
        header_rows: headerRows < 0 ? (content?.length ?? 0) : headerRows,
      },
      content: rows,
    }
  }
  return visit(body)
}

export function normalizeV6Story(story: JSONContent): JSONContent {
  const ids = new Set<string>()
  const uniqueID = (value: unknown) => {
    const id = typeof value === 'string' ? value : ''
    if (id && !ids.has(id)) {
      ids.add(id)
      return id
    }
    const next = nodeID()
    ids.add(next)
    return next
  }
  const nodeWithID = new Set([
    'paragraph',
    'bulletList',
    'orderedList',
    'listItem',
    'horizontalRule',
    'field',
  ])
  const allowed = (node: JSONContent, parent: string): JSONContent | null => {
    const valid =
      parent === 'doc'
        ? ['paragraph', 'bulletList', 'orderedList', 'horizontalRule'].includes(node.type ?? '')
        : parent === 'list'
          ? node.type === 'listItem'
          : parent === 'listItem'
            ? ['paragraph', 'bulletList', 'orderedList'].includes(node.type ?? '')
            : ['text', 'hardBreak', 'pageNumber', 'pageCount', 'field'].includes(node.type ?? '')
    if (!valid) return null
    const nextParent =
      node.type === 'bulletList' || node.type === 'orderedList'
        ? 'list'
        : node.type === 'listItem'
          ? 'listItem'
          : node.type === 'paragraph'
            ? 'paragraph'
            : parent
    const content = node.content
      ?.map((child) => allowed(child, nextParent))
      .filter((child): child is JSONContent => child !== null)
    const attrs = nodeWithID.has(node.type ?? '')
      ? { ...node.attrs, id: uniqueID(node.attrs?.id) }
      : node.attrs
    return { ...node, ...(attrs ? { attrs } : {}), ...(content ? { content } : {}) }
  }
  return {
    type: 'doc',
    content:
      story.content
        ?.map((node) => allowed(node, 'doc'))
        .filter((node): node is JSONContent => node !== null) ?? [],
  }
}

export function usedColorsForV6(document: V6Document): string[] {
  const colors = new Set<string>()
  const visit = (node?: JSONContent) => {
    if (!node) return
    for (const mark of node.marks ?? []) {
      if (typeof mark.attrs?.color === 'string') colors.add(mark.attrs.color.toUpperCase())
    }
    if (typeof node.attrs?.background === 'string' && node.attrs.background !== 'transparent')
      colors.add(node.attrs.background.toUpperCase())
    node.content?.forEach(visit)
  }
  visit(document.body)
  visit(document.header_story)
  visit(document.footer_story)
  visit(document.first_page_header_story)
  visit(document.first_page_footer_story)
  return [...colors]
}

import type { JSONContent } from '@tiptap/react'

export const V6_SCHEMA_VERSION = 6
export const V6_A4 = { width: 59528, height: 84189 }
export const V6_EMPTY_ROW_MIN_HEIGHT = 2400
export const clampV6RowMinHeight = (value: number) =>
  Math.max(V6_EMPTY_ROW_MIN_HEIGHT, Math.min(V6_A4.height, Math.round(value)))

export type V6Asset = { source: string; pixel_width: number; pixel_height: number }
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
  const visit = (node: JSONContent): JSONContent => {
    const content = node.content?.map(visit)
    if (node.type !== 'table') return { ...node, ...(content ? { content } : {}) }
    const columns = content?.[0]?.content?.length ?? 0
    const widths = content?.[0]?.content?.map((cell) => {
      const px = Array.isArray(cell.attrs?.colwidth) ? Number(cell.attrs?.colwidth[0]) : 0
      return px > 0 ? Math.round(px * 75) : Math.floor(45128 / Math.max(1, columns))
    })
    return {
      ...node,
      attrs: {
        id: node.attrs?.id || nodeID(),
        column_widths: widths,
        alignment: node.attrs?.alignment || 'left',
        border_color: node.attrs?.border_color || '#D1D5DB',
      },
      content,
    }
  }
  return visit(body)
}

export function normalizeV6Story(story: JSONContent): JSONContent {
  const allowed = (node: JSONContent, parent: string): JSONContent | null => {
    const valid =
      parent === 'doc'
        ? ['paragraph', 'bulletList', 'orderedList', 'horizontalRule'].includes(node.type ?? '')
        : parent === 'list'
          ? node.type === 'listItem'
          : parent === 'listItem'
            ? ['paragraph', 'bulletList', 'orderedList'].includes(node.type ?? '')
            : ['text', 'hardBreak', 'pageNumber', 'pageCount'].includes(node.type ?? '')
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
    return { ...node, ...(content ? { content } : {}) }
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

import type { JSONContent } from '@tiptap/react'

export const V6_SCHEMA_VERSION = 6
export const V6_A4 = { width: 59528, height: 84189 }

export type V6Asset = { source: string; pixel_width: number; pixel_height: number }
export type V6Settings = {
  page_size: 'A4'
  orientation: 'portrait' | 'landscape'
  margins: { top: number; right: number; bottom: number; left: number }
}
export type V6Document = {
  schema_version: 6
  settings: V6Settings
  body: JSONContent
  assets: V6Asset[]
}

export const nodeID = () => crypto.randomUUID()

export function createBlankV6Document(): V6Document {
  return {
    schema_version: V6_SCHEMA_VERSION,
    settings: {
      page_size: 'A4',
      orientation: 'portrait',
      margins: { top: 7200, right: 7200, bottom: 7200, left: 7200 },
    },
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: nodeID() }, content: [] }],
    },
    assets: [],
  }
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
  return [...colors]
}

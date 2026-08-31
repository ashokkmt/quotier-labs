export const V5_SCHEMA_VERSION = 5 as const
export const DU_PER_POINT = 100
export const A4_WIDTH_DU = 59528
export const A4_HEIGHT_DU = 84189
export const MAX_V5_NODES = 2000
export const MAX_V5_DEPTH = 8

// Values are quantized at all mutation/serialization boundaries; keeping this numeric makes
// geometry arithmetic ergonomic while the validator remains authoritative.
export type DocumentUnit = number
export type V5Role = 'group' | 'element' | 'flow-frame'
export type V5LayoutMode = 'fixed' | 'intrinsic' | 'flow-frame'
export type V5Visibility = 'shown' | 'hidden'
export type V5Geometry = {
  x: DocumentUnit
  y: DocumentUnit
  width: DocumentUnit
  height: DocumentUnit
  rotation: number
}
export type V5Node = {
  id: string
  kind: string
  role: V5Role
  name?: string
  geometry: V5Geometry
  layout_mode: V5LayoutMode
  binding_kind?: string
  locked: boolean
  visibility: V5Visibility
  optional: boolean
  child_ids?: string[]
  children?: V5Node[]
  story_id?: string
  next_frame_id?: string
  continuation?: 'manual' | 'auto-pages'
  continuation_master_id?: string
  props?: Record<string, unknown>
}
export type V5Page = {
  id: string
  width: DocumentUnit
  height: DocumentUnit
  margin: { top: DocumentUnit; right: DocumentUnit; bottom: DocumentUnit; left: DocumentUnit }
  child_ids: string[]
  children: V5Node[]
  master_id?: string
}
export type V5Master = { id: string; child_ids: string[]; children: V5Node[] }
export type V5Story = { id: string; kind: 'rich-text' | 'table'; content: unknown }
export type V5Document = {
  schema_version: typeof V5_SCHEMA_VERSION
  root: { pages: V5Page[]; masters?: V5Master[] }
  stories?: V5Story[]
  settings: { page_size: 'A4'; orientation: 'portrait' | 'landscape'; default_master_id?: string }
}

export function createBlankV5Document(
  nextID: () => string = () => crypto.randomUUID(),
): V5Document {
  return {
    schema_version: V5_SCHEMA_VERSION,
    root: {
      pages: [
        {
          id: nextID(),
          width: A4_WIDTH_DU,
          height: A4_HEIGHT_DU,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          child_ids: [],
          children: [],
        },
      ],
    },
    stories: [],
    settings: { page_size: 'A4', orientation: 'portrait' },
  }
}

export const du = (value: number): DocumentUnit => Math.round(value) as DocumentUnit

export function validateV5(document: unknown): string | null {
  const d = document as V5Document
  if (!d || d.schema_version !== V5_SCHEMA_VERSION) return 'schema_version must be 5'
  if (!d.root || !Array.isArray(d.root.pages) || d.root.pages.length === 0)
    return 'at least one page is required'
  if (d.settings?.page_size !== 'A4' || !['portrait', 'landscape'].includes(d.settings.orientation))
    return 'settings must describe A4 orientation'
  const stories = new Set<string>()
  for (const story of d.stories ?? []) {
    if (!story.id || stories.has(story.id)) return 'duplicate or empty story id'
    if (story.kind !== 'rich-text' && story.kind !== 'table') return `unknown story ${story.id}`
    if (story.kind === 'table') {
      const value = story.content as {
        headers?: unknown
        rows?: unknown
        column_count?: unknown
        row_height_mm?: unknown
        column_widths?: unknown
      }
      const headers = Array.isArray(value?.headers) ? value.headers : []
      const rows = Array.isArray(value?.rows) ? value.rows : []
      const columns = Math.max(
        Number(value?.column_count ?? 0),
        headers.length,
        ...rows.map((row) => (Array.isArray(row) ? row.length : 0)),
      )
      if (rows.length < 1 || rows.length > 500) return `invalid table rows: ${story.id}`
      if (columns < 1 || columns > 12) return `invalid table columns: ${story.id}`
      if (
        value.row_height_mm !== undefined &&
        (Number(value.row_height_mm) < 5 || Number(value.row_height_mm) > 30)
      )
        return `invalid table row height: ${story.id}`
      if (
        Array.isArray(value.column_widths) &&
        value.column_widths.length !== 0 &&
        (value.column_widths.length !== columns ||
          value.column_widths.some((width) => Number(width) <= 0))
      )
        return `invalid table column widths: ${story.id}`
    }
    stories.add(story.id)
  }
  const masterIds = new Set((d.root.masters ?? []).map((m) => m.id))
  const ids = new Set<string>()
  let count = 0
  const visit = (nodes: V5Node[], depth: number): string | null => {
    if (depth > MAX_V5_DEPTH) return 'maximum group depth exceeded'
    for (const node of nodes) {
      count++
      if (count > MAX_V5_NODES) return 'node limit exceeded'
      if (!node.id || ids.has(node.id)) return `duplicate or empty node id: ${node.id}`
      ids.add(node.id)
      if (!node.kind || !node.role) return `node ${node.id} requires kind and role`
      if (node.role !== 'group') {
        const known = ['text', 'image', 'table', 'shape', 'flow-frame']
        if (!known.includes(node.kind)) return `unknown widget ${node.kind}`
      }
      const g = node.geometry
      if (!g || g.width <= 0 || g.height <= 0 || g.x < 0 || g.y < 0)
        return `invalid geometry: ${node.id}`
      if (!['shown', 'hidden'].includes(node.visibility)) return `invalid visibility: ${node.id}`
      if (!['fixed', 'intrinsic', 'flow-frame'].includes(node.layout_mode))
        return `invalid layout mode: ${node.id}`
      if (
        node.role === 'flow-frame' &&
        (!node.story_id || !stories.has(node.story_id) || node.layout_mode !== 'flow-frame')
      )
        return `invalid flow frame: ${node.id}`
      if (node.role === 'flow-frame') {
        if (
          node.continuation &&
          node.continuation !== 'manual' &&
          node.continuation !== 'auto-pages'
        )
          return `invalid continuation policy: ${node.id}`
        if (node.continuation_master_id && !masterIds.has(node.continuation_master_id))
          return `missing continuation master: ${node.id}`
      }
      const children = node.children ?? []
      if (node.role !== 'group' && children.length > 0) return `non-group has children: ${node.id}`
      if (
        node.child_ids &&
        (node.child_ids.length !== children.length ||
          node.child_ids.some((id, i) => id !== children[i]?.id))
      )
        return `child order mismatch: ${node.id}`
      const result = visit(children, depth + 1)
      if (result) return result
    }
    return null
  }
  for (const page of d.root.pages) {
    if (!page.id || ids.has(page.id)) return `duplicate or empty page id: ${page.id}`
    ids.add(page.id)
    const expected =
      d.settings.orientation === 'portrait'
        ? [A4_WIDTH_DU, A4_HEIGHT_DU]
        : [A4_HEIGHT_DU, A4_WIDTH_DU]
    if (page.width !== expected[0] || page.height !== expected[1])
      return `invalid page dimensions: ${page.id}`
    const result = visit(page.children, 0)
    if (result) return result
  }
  return null
}

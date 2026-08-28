export type NodeKind = 'root' | 'section' | 'row' | 'column'
export type BuilderTarget = 'print' | 'preview'
export type StyleTokens = {
  width?: 'full' | 'half' | 'third' | 'two-thirds'
  spacing?: 'none' | 'sm' | 'md' | 'lg'
  align?: 'left' | 'center' | 'right'
  density?: 'compact' | 'comfortable'
}
export type BuilderNode = {
  id: string
  kind: NodeKind
  widget: string
  parentId: string | null
  children: string[]
  props: Record<string, unknown>
  style: StyleTokens
  responsive?: Partial<Record<BuilderTarget, Partial<StyleTokens>>>
  meta: {
    visible: boolean
    optional: boolean
    locked?: boolean
    sectionDefinitionId?: string
    symbolId?: string
  }
}
export type DocumentModel = { schemaVersion: 3; rootId: string; nodes: Record<string, BuilderNode> }
export type PersistedNode = Omit<BuilderNode, 'parentId' | 'children'> & {
  children: PersistedNode[]
  widget_type?: string
  settings?: Record<string, unknown>
  title?: string
  visible?: boolean
  optional?: boolean
}
export type PersistedDocument = { schema_version: 3; root: PersistedNode }

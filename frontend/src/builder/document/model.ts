export type NodeRole = 'root' | 'container' | 'widget'
export type LayoutDirection = 'vertical' | 'horizontal'
export type Basis = number

export type LayoutProps = {
  direction?: LayoutDirection
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg'
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg'
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  justifyContent?: 'start' | 'center' | 'end' | 'space-between'
  wrap?: 'nowrap' | 'wrap'
  basis?: Basis
  textAlign?: 'left' | 'center' | 'right'
}

export type DocumentMeta = {
  visible: boolean
  optional: boolean
  locked?: boolean
  sectionDefinitionId?: string
  generated?: boolean
}

export type BuilderNode = {
  id: string
  role: NodeRole
  type: string
  parentId: string | null
  children: string[]
  props: Record<string, unknown>
  layout: LayoutProps
  meta: DocumentMeta
}

export type DocumentModel = { schemaVersion: 4; rootId: string; nodes: Record<string, BuilderNode> }
export type PersistedNode = Omit<BuilderNode, 'parentId' | 'children'> & {
  children: PersistedNode[]
}
export type PersistedDocument = { schema_version: 4; root: PersistedNode }

export const MAX_DOCUMENT_DEPTH = 8
export const BASIS_TOTAL = 10_000

export function createId(prefix = 'n'): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createRoot(rootId = createId('root')): DocumentModel {
  return {
    schemaVersion: 4,
    rootId,
    nodes: {
      [rootId]: {
        id: rootId,
        role: 'root',
        type: 'root',
        parentId: null,
        children: [],
        props: {},
        layout: { direction: 'vertical', gap: 'md' },
        meta: { visible: true, optional: false },
      },
    },
  }
}

export function isContainer(node: BuilderNode | undefined): boolean {
  return node?.role === 'root' || node?.role === 'container'
}

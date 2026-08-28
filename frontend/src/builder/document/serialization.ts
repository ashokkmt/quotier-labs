import {
  createRoot,
  type BuilderNode,
  type DocumentModel,
  type PersistedDocument,
  type PersistedNode,
} from './model'
import { validateDocument } from './tree'

export function normalize(input: unknown): DocumentModel {
  const value = input as any
  if (value?.schema_version === 4 && value?.root) return normalizeV4(value)
  return migrateLegacy(value)
}

function normalizeV4(input: PersistedDocument): DocumentModel {
  const nodes: Record<string, BuilderNode> = {}
  const visit = (node: PersistedNode, parentId: string | null) => {
    nodes[node.id] = {
      id: node.id,
      role: node.role,
      type: node.type,
      parentId,
      children: node.children.map((child) => child.id),
      props: { ...node.props },
      layout: { ...node.layout },
      meta: {
        ...node.meta,
        visible: node.meta.visible ?? true,
        optional: node.meta.optional ?? false,
      },
    }
    node.children.forEach((child) => visit(child, node.id))
  }
  visit(input.root, null)
  const model: DocumentModel = { schemaVersion: 4, rootId: input.root.id, nodes }
  if (validateDocument(model)) throw new Error(`invalid V4 document: ${validateDocument(model)}`)
  return model
}

function migrateLegacy(value: any): DocumentModel {
  const model = createRoot('root')
  const root = value?.root ?? {
    id: model.rootId,
    children: value?.children ?? legacyRows(value?.rows),
  }
  const add = (legacy: any, parentId: string): string | null => {
    if (!legacy?.id) return null
    const oldKind = legacy.kind ?? 'section'
    const isRow = oldKind === 'row'
    const isColumn = oldKind === 'column'
    const explicitWidget = legacy.widget ?? legacy.widget_type
    const isContainer = explicitWidget
      ? explicitWidget === 'container'
      : isRow || isColumn || oldKind === 'section'
    const type = explicitWidget ?? (isContainer ? 'container' : 'field.text')
    const role = isContainer ? 'container' : 'widget'
    const node: BuilderNode = {
      id: legacy.id,
      role,
      type: role === 'container' ? 'container' : type,
      parentId,
      children: [],
      props: {
        ...(legacy.props ?? legacy.settings ?? {}),
        ...(legacy.title ? { title: legacy.title } : {}),
      },
      layout: {
        direction:
          isRow ||
          legacy.props?.direction === 'horizontal' ||
          legacy.settings?.direction === 'horizontal'
            ? 'horizontal'
            : 'vertical',
        ...(legacy.width === '50%' || legacy.style?.width === 'half'
          ? { basis: 5000 }
          : legacy.width === '33%' || legacy.style?.width === 'third'
            ? { basis: 3333 }
            : legacy.width === '66%' || legacy.style?.width === 'two-thirds'
              ? { basis: 6667 }
              : {}),
      },
      meta: {
        visible: legacy.visible ?? legacy.meta?.visible ?? true,
        optional: legacy.optional ?? legacy.meta?.optional ?? false,
        sectionDefinitionId: legacy.section_definition_id ?? legacy.meta?.sectionDefinitionId,
      },
    }
    model.nodes[node.id] = node
    model.nodes[parentId].children.push(node.id)
    for (const child of legacy.children ?? []) add(child, node.id)
    for (const field of legacy.fields ?? node.props.fields ?? [])
      add(
        {
          id: field.id,
          widget_type: `field.${field.type ?? 'text'}`,
          settings: { value: field.value ?? field.default ?? '', ...field },
          children: [],
        },
        node.id,
      )
    for (const table of legacy.tables ?? node.props.tables ?? [])
      add(
        {
          id: table.id,
          widget_type: 'table',
          settings: { value: table.name ?? '', ...table },
          children: [],
        },
        node.id,
      )
    delete node.props.fields
    delete node.props.tables
    return node.id
  }
  for (const child of root.children ?? []) add(child, model.rootId)
  return model
}

function legacyRows(rows: any): any[] {
  return Array.isArray(rows)
    ? rows.map((row: any) => ({
        id: row.id,
        kind: 'row',
        children: (row.columns ?? []).map((column: any) => ({
          id: column.id,
          kind: 'column',
          width: column.width,
          children: column.sections ?? [],
        })),
      }))
    : []
}

export function denormalize(model: DocumentModel): PersistedDocument {
  const error = validateDocument(model)
  if (error) throw new Error(`cannot serialize invalid document: ${error}`)
  const nested = (id: string): PersistedNode => {
    const node = model.nodes[id]
    return {
      id: node.id,
      role: node.role,
      type: node.type,
      props: node.props,
      layout: node.layout,
      meta: node.meta,
      children: node.children.map(nested),
    }
  }
  return { schema_version: 4, root: nested(model.rootId) }
}
export function serialize(model: DocumentModel) {
  return JSON.stringify(denormalize(model))
}
export function deserialize(value: string) {
  return normalize(JSON.parse(value))
}

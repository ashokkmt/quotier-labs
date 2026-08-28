import type { BuilderNode, DocumentModel, PersistedDocument, PersistedNode } from './model'
import type { Block } from '../../features/quotations/model/block'

export function normalize(input: unknown): DocumentModel {
  const value = input as any
  if (value?.schema_version === 3 && value?.root) return normalizeNested(value as PersistedDocument)
  if (value?.schemaVersion === 3 && value?.rootId && value?.nodes) return value as DocumentModel
  const root: BuilderNode = {
    id: 'n_root',
    kind: 'root',
    widget: 'root',
    parentId: null,
    children: [],
    props: {},
    style: {},
    meta: { visible: true, optional: false },
  }
  const nodes: Record<string, BuilderNode> = { [root.id]: root }
  const legacy = Array.isArray(value?.children) ? value.children : legacyRows(value?.rows)
  legacy.forEach((block: any) => addNested(block, root.id, nodes))
  root.children = legacy.map((block: any) => block.id)
  return { schemaVersion: 3, rootId: root.id, nodes }
}

function legacyRows(rows: any): any[] {
  return Array.isArray(rows)
    ? rows.map((row) => ({
        id: row.id,
        kind: 'row',
        visible: true,
        optional: false,
        children: (row.columns ?? []).map((column: any) => ({
          id: column.id,
          kind: 'column',
          visible: true,
          optional: false,
          width: column.width,
          children: (column.sections ?? []).map((section: any) => ({
            id: section.id,
            kind: 'section',
            widget_type: 'section',
            title: section.title,
            visible: section.visibility !== false,
            optional: !!section.optional,
            fields: section.fields ?? [],
            tables: section.tables ?? [],
            children: [],
          })),
        })),
      }))
    : []
}

function addNested(block: any, parentId: string, nodes: Record<string, BuilderNode>) {
  const node: BuilderNode = {
    id: block.id,
    kind: block.kind,
    widget: block.widget_type ?? block.kind,
    parentId,
    children: (block.children ?? []).map((child: any) => child.id),
    props: {
      ...(block.settings ?? {}),
      title: block.title,
      fields: block.fields,
      tables: block.tables,
      sectionDefinitionId: block.section_definition_id,
    },
    style: {},
    meta: {
      visible: block.visible !== false,
      optional: !!block.optional,
      sectionDefinitionId: block.section_definition_id,
    },
  }
  nodes[node.id] = node
  for (const child of block.children ?? []) addNested(child, node.id, nodes)
}

function normalizeNested(input: PersistedDocument): DocumentModel {
  const nodes: Record<string, BuilderNode> = {}
  const visit = (node: PersistedNode, parentId: string | null): BuilderNode => {
    const builderNode: BuilderNode = {
      id: node.id,
      kind: node.kind,
      widget: node.widget_type ?? node.widget,
      parentId,
      children: node.children.map((child) => child.id),
      props: {
        ...(node.props ?? node.settings ?? {}),
        ...(node.title ? { title: node.title } : {}),
      },
      style: { ...node.style },
      responsive: node.responsive,
      meta: Object.assign({ visible: true, optional: false }, node.meta ?? {}, {
        visible: node.visible ?? node.meta?.visible ?? true,
        optional: node.optional ?? node.meta?.optional ?? false,
      }),
    }
    nodes[builderNode.id] = builderNode
    node.children.forEach((child) => visit(child, builderNode.id))
    return builderNode
  }
  const root = visit(input.root, null)
  return { schemaVersion: 3, rootId: root.id, nodes }
}

export function denormalize(model: DocumentModel): PersistedDocument {
  const root = model.nodes[model.rootId]
  if (!root || root.kind !== 'root') throw new Error('document root is missing')
  return { schema_version: 3, root: toNested(root, model) }
}
function toNested(node: BuilderNode, model: DocumentModel): PersistedNode {
  return {
    id: node.id,
    kind: node.kind,
    widget: node.widget,
    widget_type: node.widget,
    props: node.props,
    settings: node.props,
    style: node.style,
    responsive: node.responsive,
    meta: node.meta,
    visible: node.meta.visible,
    optional: node.meta.optional,
    title: typeof node.props.title === 'string' ? node.props.title : undefined,
    children: node.children.map((id) => {
      const child = model.nodes[id]
      if (!child) throw new Error(`missing child node ${id}`)
      return toNested(child, model)
    }),
  }
}

export function serialize(model: DocumentModel) {
  return JSON.stringify(denormalize(model))
}
export function deserialize(value: string) {
  return normalize(JSON.parse(value))
}

export function toCanvasDocument(model: DocumentModel): { schema_version: 3; children: Block[] } {
  const root = model.nodes[model.rootId]
  const convert = (node: BuilderNode): Block => ({
    id: node.id,
    kind: node.kind === 'root' ? 'section' : node.kind,
    widget_type: node.widget === 'section' ? undefined : (node.widget as Block['widget_type']),
    children: node.children.map((id) => convert(model.nodes[id])),
    title: typeof node.props.title === 'string' ? node.props.title : undefined,
    settings: { ...node.props },
    visible: node.meta.visible,
    optional: node.meta.optional,
    width:
      node.style.width === 'half'
        ? '50%'
        : node.style.width === 'third'
          ? '33%'
          : node.style.width === 'two-thirds'
            ? '66%'
            : '100%',
  })
  return { schema_version: 3, children: root.children.map((id) => convert(model.nodes[id])) }
}

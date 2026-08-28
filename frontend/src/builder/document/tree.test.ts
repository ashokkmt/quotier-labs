import { describe, expect, it } from 'vitest'
import { createRoot, type BuilderNode } from './model'
import {
  createNode,
  duplicateSubtree,
  insertNode,
  moveNode,
  resizeSiblings,
  validateDocument,
  wrapBeside,
} from './tree'

const widget = (id: string): BuilderNode => ({
  id,
  role: 'widget',
  type: 'field.text',
  parentId: null,
  children: [],
  props: { value: id },
  layout: {},
  meta: { visible: true, optional: false },
})

describe('V4 builder tree kernel', () => {
  it('accepts root widgets and validates a normalized tree', () => {
    const root = createRoot('root')
    const result = insertNode(root, widget('text'), 'root')
    expect(result.ok).toBe(true)
    if (result.ok) expect(validateDocument(result.document)).toBeNull()
  })
  it('wraps an existing subtree beside a target without duplicate parent references', () => {
    let document = createRoot('root')
    const first = insertNode(document, widget('a'), 'root')
    if (!first.ok) throw new Error(first.reason)
    document = first.document
    const second = insertNode(document, widget('b'), 'root')
    if (!second.ok) throw new Error(second.reason)
    document = second.document
    const wrapped = wrapBeside(document, document.nodes.b, 'a', 'right')
    expect(wrapped.ok).toBe(true)
    if (wrapped.ok) {
      const wrapper = wrapped.document.nodes.root.children[0]
      expect(wrapped.document.nodes[wrapper].layout.direction).toBe('horizontal')
      expect(wrapped.document.nodes[wrapper].children).toEqual(['a', 'b'])
      expect(validateDocument(wrapped.document)).toBeNull()
    }
  })
  it('duplicates complete subtrees and resizes adjacent shares', () => {
    let document = createRoot('root')
    const container = createNode('container')!
    container.id = 'row'
    container.layout.direction = 'horizontal'
    const added = insertNode(document, container, 'root')
    if (!added.ok) throw new Error(added.reason)
    document = added.document
    for (const id of ['a', 'b']) {
      const result = insertNode(document, widget(id), 'row')
      if (!result.ok) throw new Error(result.reason)
      document = result.document
    }
    const resized = resizeSiblings(document, 'a', 3000)
    if (!resized.ok) throw new Error(resized.reason)
    expect(resized.document.nodes.a.layout.basis).toBe(3000)
    expect(resized.document.nodes.b.layout.basis).toBe(7000)
    const copied = duplicateSubtree(resized.document, 'a')
    expect(copied.ok).toBe(true)
    if (copied.ok) expect(copied.document.nodes.row.children).toHaveLength(3)
  })
  it('rejects moving content into its own descendant', () => {
    const root = createRoot('root')
    const container = createNode('container')!
    container.id = 'parent'
    const first = insertNode(root, container, 'root')
    if (!first.ok) throw new Error(first.reason)
    const child = createNode('container')!
    child.id = 'child'
    const second = insertNode(first.document, child, 'parent')
    if (!second.ok) throw new Error(second.reason)
    expect(moveNode(second.document, 'parent', 'child').ok).toBe(false)
  })
})

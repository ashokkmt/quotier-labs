import type { Editor } from '@tiptap/react'

export type SelectionValue<T> = T | 'mixed'

export function uniformValue<T>(values: T[], fallback: T): SelectionValue<T> {
  if (!values.length) return fallback
  return values.every((value) => Object.is(value, values[0])) ? values[0] : 'mixed'
}

export function paragraphSelectionValue<T>(
  editor: Editor,
  attribute: string,
  fallback: T,
): SelectionValue<T> {
  const { from, to, empty } = editor.state.selection
  if (empty) return (editor.getAttributes('paragraph')[attribute] ?? fallback) as T
  const values: T[] = []
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'paragraph') values.push((node.attrs[attribute] ?? fallback) as T)
  })
  return uniformValue(values, fallback)
}

export function markSelectionState(editor: Editor, markName: string): boolean | 'mixed' {
  const { from, to, empty } = editor.state.selection
  if (empty) return editor.isActive(markName)
  const values: boolean[] = []
  editor.state.doc.nodesBetween(from, to, (node, position) => {
    if (!node.isText || Math.max(from, position) >= Math.min(to, position + node.nodeSize)) return
    values.push(node.marks.some((mark) => mark.type.name === markName))
  })
  return uniformValue(values, false)
}

export function markAttributeSelectionValue<T>(
  editor: Editor,
  markName: string,
  attribute: string,
  fallback: T,
): SelectionValue<T> {
  const { from, to, empty } = editor.state.selection
  if (empty) return (editor.getAttributes(markName)[attribute] ?? fallback) as T
  const values: T[] = []
  editor.state.doc.nodesBetween(from, to, (node, position) => {
    if (!node.isText || Math.max(from, position) >= Math.min(to, position + node.nodeSize)) return
    const mark = node.marks.find((candidate) => candidate.type.name === markName)
    values.push((mark?.attrs[attribute] ?? fallback) as T)
  })
  return uniformValue(values, fallback)
}

export function setTextStyleAttribute(editor: Editor, attribute: string, value: unknown) {
  const { from, to, empty } = editor.state.selection
  const type = editor.schema.marks.textStyle
  if (!type) return false
  if (empty)
    return editor
      .chain()
      .focus()
      .setMark('textStyle', { ...editor.getAttributes('textStyle'), [attribute]: value })
      .run()
  const transaction = editor.state.tr.removeMark(from, to, type)
  editor.state.doc.nodesBetween(from, to, (node, position) => {
    if (!node.isText) return
    const start = Math.max(from, position)
    const end = Math.min(to, position + node.nodeSize)
    if (start >= end) return
    const current = node.marks.find((mark) => mark.type === type)
    transaction.addMark(start, end, type.create({ ...current?.attrs, [attribute]: value }))
  })
  editor.view.dispatch(transaction.scrollIntoView())
  return true
}

import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import {
  maxV6ListDepth,
  reseedV6JSON,
  sanitizeStyle,
  sanitizeV6Paste,
  v6Extensions,
} from './extensions'
import { createBlankV6Document, normalizeV6Body } from './model'

describe('V6 paste guard', () => {
  it('removes executable, arbitrary style, and external image content', () => {
    const clean = sanitizeV6Paste(
      '<p style="position:fixed" onclick="bad()">Safe<script>bad()</script><img src="https://example.com/x.png"></p>',
    )
    expect(clean).toBe('<p>Safe</p>')
    expect(sanitizeV6Paste('<p onmouseover=bad><a href=javascript:bad>Safe</a>')).toBe(
      '<p><a>Safe</a>',
    )
    expect(sanitizeV6Paste('<p>Before<script>alert(1)')).toBe('<p>Before')
  })

  it('rekeys copied blocks so internal rich paste keeps stable IDs unique', () => {
    const pasted = reseedV6JSON({
      type: 'bulletList',
      attrs: { id: 'list' },
      content: [
        {
          type: 'listItem',
          attrs: { id: 'item' },
          content: [{ type: 'paragraph', attrs: { id: 'paragraph' } }],
        },
      ],
    })
    expect(pasted.attrs.id).not.toBe('list')
    expect(pasted.content[0].attrs.id).not.toBe('item')
    expect(pasted.content[0].content[0].attrs.id).not.toBe('paragraph')
  })

  it('measures nested lists for the three-level transaction guard', () => {
    const list = (child: unknown) => ({
      type: 'bulletList',
      content: [{ type: 'listItem', content: [child] }],
    })
    const paragraph = { type: 'paragraph' }
    expect(maxV6ListDepth(list(list(list(paragraph))))).toBe(3)
    expect(maxV6ListDepth(list(list(list(list(paragraph)))))).toBe(4)
  })

  it('keeps supported Word-like formatting and safe links only', () => {
    const clean = sanitizeV6Paste(
      '<p style="text-align:justify;position:fixed"><a href="javascript:bad()" style="font-weight:bold;color:#112233">Terms</a></p>',
    )
    expect(clean).toBe(
      '<p style="text-align:justify"><a style="font-weight:bold;color:#112233">Terms</a></p>',
    )
    expect(sanitizeStyle('font-size:12pt;display:none;text-decoration:line-through')).toBe(
      'font-size:12pt;text-decoration:line-through',
    )
    expect(sanitizeV6Paste('<a href=https://quotier.example>Safe</a>')).toBe(
      '<a href="https://quotier.example">Safe</a>',
    )
  })
})

describe('V6 editing persistence', () => {
  it('assigns an ID to a paragraph created by Enter before autosave receives it', () => {
    const document = createBlankV6Document()
    document.body.content![0].content = [{ type: 'text', text: 'First line' }]
    const savedBodies: any[] = []
    const editor = new Editor({
      extensions: v6Extensions,
      content: document.body,
      onUpdate: ({ editor }) => savedBodies.push(editor.getJSON()),
    })
    editor.commands.setTextSelection(6)
    editor.commands.splitBlock()

    const paragraphs = editor.getJSON().content?.filter((node) => node.type === 'paragraph') ?? []
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs.map((paragraph) => paragraph.attrs?.id)).toEqual([
      expect.any(String),
      expect.any(String),
    ])
    expect(new Set(paragraphs.map((paragraph) => paragraph.attrs?.id)).size).toBe(1)
    const persisted = normalizeV6Body(savedBodies.at(-1))
    expect(new Set(persisted.content?.map((paragraph) => paragraph.attrs?.id)).size).toBe(2)
    editor.destroy()
  })

  it('normalizes duplicated paragraph IDs created while editing table cells before autosave', () => {
    const editor = new Editor({ extensions: v6Extensions, content: createBlankV6Document().body })
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false })
    editor.commands.setTextSelection(4)
    editor.commands.insertContent({ type: 'text', text: 'Cell value' })
    editor.commands.splitBlock()

    const persisted = normalizeV6Body(editor.getJSON())
    const ids: string[] = []
    const collect = (node: any) => {
      if (typeof node.attrs?.id === 'string') ids.push(node.attrs.id)
      node.content?.forEach(collect)
    }
    collect(persisted)
    expect(ids).toHaveLength(new Set(ids).size)
    expect(persisted.content?.some((node) => node.type === 'table')).toBe(true)
    editor.destroy()
  })
})

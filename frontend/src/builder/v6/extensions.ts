import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Paragraph } from '@tiptap/extension-paragraph'
import { TextStyle } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { Underline } from '@tiptap/extension-underline'
import { Table, TableCell, TableRow } from '@tiptap/extension-table'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageNodeView } from './ImageNodeView'
import { LineItemNodeView } from './LineItemNodeView'

const ParagraphV6 = Paragraph.extend({
  addAttributes() {
    return {
      id: { default: null },
      alignment: { default: 'left', renderHTML: (a) => ({ style: `text-align:${a.alignment}` }) },
      spacing_before: {
        default: 0,
        renderHTML: (a) => ({ style: `margin-top:${Number(a.spacing_before) / 100}pt` }),
      },
      spacing_after: {
        default: 0,
        renderHTML: (a) => ({ style: `margin-bottom:${Number(a.spacing_after) / 100}pt` }),
      },
      line_height: {
        default: 1.2,
        renderHTML: (a) => ({ style: `line-height:${a.line_height}` }),
      },
      left_indent: {
        default: 0,
        renderHTML: (a) => ({ style: `margin-left:${Number(a.left_indent) / 100}pt` }),
      },
      first_line_indent: {
        default: 0,
        renderHTML: (a) => ({ style: `text-indent:${Number(a.first_line_indent) / 100}pt` }),
      },
      right_indent: {
        default: 0,
        renderHTML: (a) => ({ style: `margin-right:${Number(a.right_indent) / 100}pt` }),
      },
    }
  },
})

const InlineStyle = TextStyle.extend({
  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (element) => element.style.fontFamily.replace(/["']/g, '') || null,
        renderHTML: (a) => (a.fontFamily ? { style: `font-family:${a.fontFamily}` } : {}),
      },
      fontSize: {
        default: null,
        parseHTML: (element) => {
          const size = Number.parseFloat(element.style.fontSize)
          return Number.isFinite(size) ? Math.round(size * 100) : null
        },
        renderHTML: (a) => (a.fontSize ? { style: `font-size:${Number(a.fontSize) / 100}pt` } : {}),
      },
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (a) => (a.color ? { style: `color:${a.color}` } : {}),
      },
    }
  },
})

const TableV6 = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: { default: null },
      column_widths: { default: [15000, 15000, 15000] },
      alignment: { default: 'left' },
      border_color: { default: '#D1D5DB' },
    }
  },
}).configure({ resizable: true, allowTableNodeSelection: true })

const TableCellV6 = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      background: {
        default: 'transparent',
        renderHTML: (a) => ({ style: `background:${a.background}` }),
      },
      alignment: { default: 'left' },
    }
  },
})

const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ id: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-v6-page-break]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-v6-page-break': '', role: 'separator' }),
    'Page break',
  ],
})

const ImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({
    id: { default: null },
    source: { default: '' },
    width: { default: 18000 },
    height: { default: 10000 },
    pixel_width: { default: 1 },
    pixel_height: { default: 1 },
    alignment: { default: 'left' },
    alt: { default: '' },
  }),
  parseHTML: () => [{ tag: 'figure[data-v6-image]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'figure',
    mergeAttributes(HTMLAttributes, { 'data-v6-image': '' }),
  ],
  addNodeView: () => ReactNodeViewRenderer(ImageNodeView),
})

const LineItemTable = Node.create({
  name: 'lineItemTable',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ id: { default: null }, rows: { default: [] } }),
  parseHTML: () => [{ tag: 'div[data-v6-line-items]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-v6-line-items': '' }),
  ],
  addNodeView: () => ReactNodeViewRenderer(LineItemNodeView),
})

const StableIDs = Extension.create({
  name: 'stableV6IDs',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('stableV6IDs'),
        appendTransaction: (_transactions, _oldState, state) => {
          let tr = state.tr
          let changed = false
          state.doc.descendants((node, pos) => {
            if (
              ['paragraph', 'table', 'imageBlock', 'pageBreak', 'lineItemTable'].includes(
                node.type.name,
              ) &&
              !node.attrs.id
            ) {
              tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: crypto.randomUUID() })
              changed = true
            }
          })
          return changed ? tr : null
        },
      }),
    ]
  },
})

const PasteGuard = Extension.create({
  name: 'v6PasteGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('v6PasteGuard'),
        props: {
          transformPastedHTML: sanitizeV6Paste,
        },
      }),
    ]
  },
})

export const sanitizeV6Paste = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, '')
    .replace(/\sstyle\s*=\s*(["']).*?\1/gi, '')
    .replace(/<img[\s\S]*?>/gi, '')

export const v6Extensions = [
  StarterKit.configure({
    paragraph: false,
    heading: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    code: false,
    codeBlock: false,
    strike: false,
    horizontalRule: false,
    hardBreak: false,
    link: false,
  }),
  ParagraphV6,
  InlineStyle,
  Underline,
  Highlight.configure({ multicolor: true }),
  TableV6,
  TableRow,
  TableCellV6,
  PageBreak,
  ImageBlock,
  LineItemTable,
  StableIDs,
  PasteGuard,
]

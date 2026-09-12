import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Fragment, Slice } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { Paragraph } from '@tiptap/extension-paragraph'
import { TextStyle } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageNodeView } from './ImageNodeView'
import { LineItemNodeView } from './LineItemNodeView'
import { isSafeV6Link } from './model'

const numericAttr = (name: string) => ({
  default: 0,
  parseHTML: (element: HTMLElement) => Number(element.getAttribute(`data-v6-${name}`) || 0),
  renderHTML: (attrs: Record<string, unknown>) => {
    const value = Number(attrs[name.replaceAll('-', '_')] || 0)
    return value ? { [`data-v6-${name}`]: value } : {}
  },
})

const ParagraphV6 = Paragraph.extend({
  addAttributes() {
    return {
      id: { default: null },
      style: {
        default: 'Normal',
        parseHTML: (element) => element.getAttribute('data-v6-style') || 'Normal',
        renderHTML: (attrs) => ({ 'data-v6-style': attrs.style }),
      },
      alignment: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-v6-align') || element.style.textAlign || null,
        renderHTML: (attrs) =>
          attrs.alignment
            ? { 'data-v6-align': attrs.alignment, style: `text-align:${attrs.alignment}` }
            : {},
      },
      spacing_before: numericAttr('spacing-before'),
      spacing_after: numericAttr('spacing-after'),
      line_height: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute('data-v6-line-height') || 0) || null,
        renderHTML: (attrs) =>
          attrs.line_height
            ? {
                'data-v6-line-height': attrs.line_height,
                style: `line-height:${attrs.line_height}`,
              }
            : {},
      },
      left_indent: numericAttr('left-indent'),
      first_line_indent: numericAttr('first-line-indent'),
      hanging_indent: numericAttr('hanging-indent'),
      right_indent: numericAttr('right-indent'),
    }
  },
  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs
    const styles = [
      attrs.spacing_before ? `margin-top:${Number(attrs.spacing_before) / 100}pt` : '',
      attrs.spacing_after ? `margin-bottom:${Number(attrs.spacing_after) / 100}pt` : '',
      attrs.left_indent ? `margin-left:${Number(attrs.left_indent) / 100}pt` : '',
      attrs.right_indent ? `margin-right:${Number(attrs.right_indent) / 100}pt` : '',
      attrs.first_line_indent ? `text-indent:${Number(attrs.first_line_indent) / 100}pt` : '',
      attrs.hanging_indent ? `text-indent:-${Number(attrs.hanging_indent) / 100}pt` : '',
    ].filter(Boolean)
    return [
      'p',
      mergeAttributes(HTMLAttributes, styles.length ? { style: styles.join(';') } : {}),
      0,
    ]
  },
})

const InlineStyle = TextStyle.extend({
  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-v6-font') ||
          element.style.fontFamily.replace(/["']/g, '') ||
          null,
        renderHTML: (attrs) =>
          attrs.fontFamily
            ? { 'data-v6-font': attrs.fontFamily, style: `font-family:${attrs.fontFamily}` }
            : {},
      },
      fontSize: {
        default: null,
        parseHTML: (element) => {
          const stored = Number(element.getAttribute('data-v6-size'))
          if (stored) return stored
          const size = Number.parseFloat(element.style.fontSize)
          return Number.isFinite(size) ? Math.round(size * 100) : null
        },
        renderHTML: (attrs) =>
          attrs.fontSize
            ? {
                'data-v6-size': attrs.fontSize,
                style: `font-size:${Number(attrs.fontSize) / 100}pt`,
              }
            : {},
      },
      color: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-v6-color') || element.style.color || null,
        renderHTML: (attrs) =>
          attrs.color ? { 'data-v6-color': attrs.color, style: `color:${attrs.color}` } : {},
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

const TableRowV6 = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      min_height: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute('data-v6-min-height') || 0),
        renderHTML: (attrs) =>
          attrs.min_height
            ? {
                'data-v6-min-height': attrs.min_height,
                style: `height:${Number(attrs.min_height) / 75}px`,
              }
            : {},
      },
    }
  },
})

const TableCellV6 = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colwidth: { default: [200] },
      background: {
        default: 'transparent',
        renderHTML: (attrs) => ({ style: `background:${attrs.background}` }),
      },
      alignment: { default: 'left' },
    }
  },
})

const TableHeaderV6 = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colwidth: { default: [200] },
      background: {
        default: 'transparent',
        renderHTML: (attrs) => ({ style: `background:${attrs.background}` }),
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

const HorizontalRuleV6 = Node.create({
  name: 'horizontalRule',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ id: { default: null } }),
  parseHTML: () => [{ tag: 'hr' }],
  renderHTML: ({ HTMLAttributes }) => [
    'hr',
    mergeAttributes(HTMLAttributes, { 'data-v6-rule': '' }),
  ],
})

const pageField = (name: 'pageNumber' | 'pageCount', label: string) =>
  Node.create({
    name,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    parseHTML: () => [{ tag: `span[data-v6-field="${name}"]` }],
    renderHTML: () => [
      'span',
      { 'data-v6-field': name, class: 'v6-page-field', contenteditable: 'false' },
      label,
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

const idNodes = [
  'paragraph',
  'table',
  'imageBlock',
  'pageBreak',
  'lineItemTable',
  'bulletList',
  'orderedList',
  'listItem',
  'horizontalRule',
]

const StableIDs = Extension.create({
  name: 'stableV6IDs',
  addGlobalAttributes() {
    return [
      {
        types: ['bulletList', 'orderedList', 'listItem'],
        attributes: { id: { default: null } },
      },
    ]
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('stableV6IDs'),
        appendTransaction: (_transactions, _oldState, state) => {
          let tr = state.tr
          let changed = false
          state.doc.descendants((node, pos) => {
            if (idNodes.includes(node.type.name) && !node.attrs.id) {
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
          transformPasted: (slice) =>
            new Slice(
              Fragment.fromJSON(this.editor.schema, reseedV6JSON(slice.content.toJSON())),
              slice.openStart,
              slice.openEnd,
            ),
        },
      }),
    ]
  },
})

const Phase2Commands = Extension.create({
  name: 'phase2Commands',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-Space': () => this.editor.commands.insertContent('\u00a0'),
      'Mod-Shift-v': () => {
        void navigator.clipboard
          ?.readText()
          .then((text) => this.editor.commands.insertContent(text))
          .catch(() => undefined)
        return true
      },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('v6ListDepth'),
        filterTransaction: (transaction) =>
          !transaction.docChanged || maxV6ListDepth(transaction.doc.toJSON()) <= 3,
      }),
    ]
  },
})

export const v6Extensions = [
  StarterKit.configure({
    paragraph: false,
    heading: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: false, linkOnPaste: true },
  }),
  ParagraphV6,
  InlineStyle,
  Highlight.configure({ multicolor: true }),
  TableV6,
  TableRowV6,
  TableHeaderV6,
  TableCellV6,
  PageBreak,
  HorizontalRuleV6,
  pageField('pageNumber', 'Page'),
  pageField('pageCount', 'Pages'),
  ImageBlock,
  LineItemTable,
  StableIDs,
  PasteGuard,
  Phase2Commands,
]

export const sanitizeV6Paste = (html: string) =>
  html
    .replace(/<(script|style|noscript|iframe|object)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi, '')
    .replace(/\son[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sstyle\s*=\s*(["'])(.*?)\1/gi, (_match, quote, value) => {
      const safe = sanitizeStyle(value)
      return safe ? ` style=${quote}${safe}${quote}` : ''
    })
    .replace(/\sstyle\s*=\s*([^\s"'>]+)/gi, (_match, value) => {
      const safe = sanitizeStyle(value)
      return safe ? ` style="${safe}"` : ''
    })
    .replace(/\shref\s*=\s*(["'])(.*?)\1/gi, (_match, quote, value) =>
      isSafeV6Link(value) ? ` href=${quote}${value}${quote}` : '',
    )
    .replace(/\shref\s*=\s*([^\s"'>]+)/gi, (_match, value) =>
      isSafeV6Link(value) ? ` href="${value}"` : '',
    )
    .replace(/<img[\s\S]*?>/gi, '')

export const sanitizeStyle = (value: string) =>
  value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const [property, raw = ''] = part.split(':', 2).map((item) => item.trim().toLowerCase())
      if (property === 'font-weight') return raw === 'bold' || Number(raw) >= 600
      if (property === 'font-style') return raw === 'italic'
      if (property === 'text-decoration') return /^(underline|line-through)$/.test(raw)
      if (property === 'text-align') return /^(left|center|right|justify)$/.test(raw)
      if (property === 'color' || property === 'background-color') return /^#[0-9a-f]{6}$/.test(raw)
      if (property === 'font-family')
        return /^(quotier sans|quotier serif|quotier mono)$/.test(raw.replace(/["']/g, ''))
      if (property === 'font-size') {
        const size = Number.parseFloat(raw)
        return /pt$/.test(raw) && size >= 6 && size <= 72
      }
      return false
    })
    .join(';')

export const reseedV6JSON = (value: any): any => {
  if (Array.isArray(value)) return value.map(reseedV6JSON)
  if (!value || typeof value !== 'object') return value
  const result = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, reseedV6JSON(child)]),
  )
  if (idNodes.includes(String(result.type)) && result.attrs?.id)
    result.attrs = { ...result.attrs, id: crypto.randomUUID() }
  if (result.type === 'lineItemTable' && Array.isArray(result.attrs?.rows))
    result.attrs = {
      ...result.attrs,
      rows: result.attrs.rows.map((row: any) => ({ ...row, id: crypto.randomUUID() })),
    }
  return result
}
export const maxV6ListDepth = (node: any, depth = 0): number => {
  const next = node.type === 'bulletList' || node.type === 'orderedList' ? depth + 1 : depth
  return Math.max(next, ...(node.content ?? []).map((child: any) => maxV6ListDepth(child, next)))
}

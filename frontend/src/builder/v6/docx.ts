import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeightRule,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx'
import { GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'
import type { JSONContent } from '@tiptap/react'
import { isSafeV6Link, starterV6Styles, v6Style, type V6Document, type V6Style } from './model'

const twips = (du: number) => Math.round(du / 5)
const color = (value?: string) => value?.replace(/^#/, '').toUpperCase()
const styleID = (name: string) => `Quotier${name.replace(/\s+/g, '')}`

export async function generateV6Docx(document: V6Document): Promise<ArrayBuffer> {
  const children = await blocks(document, document.body.content ?? [])
  const portrait = document.settings.orientation === 'portrait'
  const width = twips(portrait ? 59528 : 84189)
  const height = twips(portrait ? 84189 : 59528)
  const headers: { default?: Header; first?: Header } = {}
  const footers: { default?: Footer; first?: Footer } = {}
  if (document.header_story)
    headers.default = new Header({
      children: await blocks(document, document.header_story.content ?? []),
    })
  if (document.footer_story)
    footers.default = new Footer({
      children: await blocks(document, document.footer_story.content ?? []),
    })
  const firstHeaderStory = document.first_page_header_story ?? document.header_story
  const firstFooterStory = document.first_page_footer_story ?? document.footer_story
  if (document.settings.different_first_page && firstHeaderStory)
    headers.first = new Header({
      children: await blocks(document, firstHeaderStory.content ?? []),
    })
  if (document.settings.different_first_page && firstFooterStory)
    footers.first = new Footer({
      children: await blocks(document, firstFooterStory.content ?? []),
    })
  const output = new Document({
    styles: {
      paragraphStyles: (document.styles?.length ? document.styles : starterV6Styles()).map(
        (style) => ({
          id: styleID(style.name),
          name: style.name,
          basedOn: style.name === 'Normal' ? undefined : styleID('Normal'),
          quickFormat: true,
          run: runStyle(style),
          paragraph: paragraphStyle(style),
        }),
      ),
    },
    numbering: {
      config: [
        {
          reference: 'v6-numbered',
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 260 } } },
          })),
        },
      ],
    },
    sections: [
      {
        headers,
        footers,
        properties: {
          titlePage: Boolean(document.settings.different_first_page),
          page: {
            size: { width, height },
            margin: {
              top: twips(document.settings.margins.top),
              right: twips(document.settings.margins.right),
              bottom: twips(document.settings.margins.bottom),
              left: twips(document.settings.margins.left),
            },
          },
        },
        children,
      },
    ],
  })
  return Packer.toArrayBuffer(output)
}

async function blocks(
  document: V6Document,
  nodes: JSONContent[],
  listLevel = 0,
): Promise<Array<Paragraph | Table>> {
  const output: Array<Paragraph | Table> = []
  for (const node of nodes) {
    if (node.type === 'paragraph') output.push(paragraph(document, node))
    if (node.type === 'pageBreak') output.push(new Paragraph({ children: [new PageBreak()] }))
    if (node.type === 'horizontalRule')
      output.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '6B7280' } },
        }),
      )
    if (node.type === 'table') output.push(table(document, node))
    if (node.type === 'lineItemTable') output.push(lineItems(document, node))
    if (node.type === 'imageBlock') output.push(await image(node))
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      for (const item of node.content ?? []) {
        for (const child of item.content ?? []) {
          if (child.type === 'paragraph')
            output.push(
              paragraph(document, child, {
                ...(node.type === 'bulletList'
                  ? { bullet: { level: listLevel } }
                  : { numbering: { reference: 'v6-numbered', level: listLevel } }),
              }),
            )
          else output.push(...(await blocks(document, [child], listLevel + 1)))
        }
      }
    }
  }
  return output
}

function paragraph(
  document: V6Document,
  node: JSONContent,
  extra: Record<string, unknown> = {},
): Paragraph {
  const attrs = node.attrs ?? {}
  const style = v6Style(document, String(attrs.style || 'Normal'))
  return new Paragraph({
    style: styleID(style.name),
    alignment: alignment(attrs.alignment || style.alignment),
    spacing: {
      before: twips(Number(attrs.spacing_before || style.spacing_before || 0)),
      after: twips(Number(attrs.spacing_after || style.spacing_after || 0)),
      line: Math.round(Number(attrs.line_height || style.line_height) * 240),
    },
    indent: {
      left: twips(Number(attrs.left_indent || style.left_indent || 0)),
      right: twips(Number(attrs.right_indent || style.right_indent || 0)),
      firstLine: attrs.hanging_indent ? undefined : twips(Number(attrs.first_line_indent || 0)),
      hanging: attrs.hanging_indent ? twips(Number(attrs.hanging_indent)) : undefined,
    },
    children: inlineChildren(node.content ?? [], style),
    ...extra,
  })
}

function inlineChildren(nodes: JSONContent[], style: V6Style): ParagraphChild[] {
  return nodes.map((node) => {
    if (node.type === 'hardBreak') return new TextRun({ break: 1 })
    if (node.type === 'pageNumber') return new TextRun({ children: [PageNumber.CURRENT] })
    if (node.type === 'pageCount') return new TextRun({ children: [PageNumber.TOTAL_PAGES] })
    const options: Record<string, unknown> = { text: node.text ?? '', ...runStyle(style) }
    let href = ''
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') options.bold = true
      if (mark.type === 'italic') options.italics = true
      if (mark.type === 'underline') options.underline = {}
      if (mark.type === 'strike') options.strike = true
      if (mark.type === 'textStyle') {
        if (mark.attrs?.fontFamily) options.font = mark.attrs.fontFamily
        if (mark.attrs?.fontSize) options.size = Math.round(Number(mark.attrs.fontSize) / 50)
        if (mark.attrs?.color) options.color = color(String(mark.attrs.color))
      }
      if (mark.type === 'highlight' && mark.attrs?.color)
        options.shading = { fill: color(String(mark.attrs.color)) }
      if (mark.type === 'link') href = String(mark.attrs?.href ?? '')
    }
    const run = new TextRun(options)
    return isSafeV6Link(href) ? new ExternalHyperlink({ children: [run], link: href }) : run
  })
}

function table(document: V6Document, node: JSONContent): Table {
  return new Table({
    rows: (node.content ?? []).map(
      (row) =>
        new TableRow({
          height: Number(row.attrs?.min_height || 0)
            ? { value: twips(Number(row.attrs?.min_height)), rule: HeightRule.ATLEAST }
            : undefined,
          children: (row.content ?? []).map(
            (cell) =>
              new TableCell({
                shading:
                  cell.attrs?.background && cell.attrs.background !== 'transparent'
                    ? { fill: color(String(cell.attrs.background)) }
                    : undefined,
                children: (cell.content ?? []).map((child) => paragraph(document, child)),
              }),
          ),
        }),
    ),
    width: { size: 100, type: WidthType.PERCENTAGE },
  })
}

function lineItems(document: V6Document, node: JSONContent): Table {
  const rows = Array.isArray(node.attrs?.rows) ? node.attrs.rows : []
  const values = [
    ['Description', 'Qty', 'Rate', 'Discount', 'Tax'],
    ...rows.map((row: any) => [
      String(row.description ?? ''),
      String(row.quantity ?? 0),
      money(Number(row.rate ?? 0)),
      money(Number(row.discount ?? 0)),
      `${row.tax_rate ?? 0}%`,
    ]),
  ]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: values.map(
      (values, index) =>
        new TableRow({
          tableHeader: index === 0,
          children: values.map(
            (value) =>
              new TableCell({
                children: [
                  new Paragraph({
                    style: styleID(index === 0 ? 'Table Header' : 'Table Body'),
                    children: [
                      new TextRun({
                        text: value,
                        ...runStyle(v6Style(document, index === 0 ? 'Table Header' : 'Table Body')),
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  })
}

async function image(node: JSONContent): Promise<Paragraph> {
  const dataURI = await GetImageDataURI(String(node.attrs?.source ?? ''))
  const [header, encoded] = dataURI.split(',', 2)
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
  const width = Math.max(1, Math.round(Number(node.attrs?.width ?? 7500) / 75))
  const height = Math.max(1, Math.round(Number(node.attrs?.height ?? 7500) / 75))
  const type = header.includes('image/jpeg') ? 'jpg' : 'png'
  return new Paragraph({
    alignment: alignment(node.attrs?.alignment),
    children: [new ImageRun({ data: bytes, transformation: { width, height }, type })],
  })
}

const runStyle = (style: V6Style) => ({
  font: style.font_family,
  size: Math.round(style.font_size / 50),
  bold: style.bold,
  italics: style.italic,
  underline: style.underline ? {} : undefined,
  strike: style.strike,
  color: color(style.color),
  shading: style.highlight ? { fill: color(style.highlight) } : undefined,
})
const paragraphStyle = (style: V6Style) => ({
  alignment: alignment(style.alignment),
  spacing: {
    before: twips(style.spacing_before || 0),
    after: twips(style.spacing_after || 0),
    line: Math.round(style.line_height * 240),
  },
  indent: { left: twips(style.left_indent || 0), right: twips(style.right_indent || 0) },
})
const alignment = (value: unknown) =>
  value === 'center'
    ? AlignmentType.CENTER
    : value === 'right'
      ? AlignmentType.RIGHT
      : value === 'justify'
        ? AlignmentType.JUSTIFIED
        : AlignmentType.LEFT
const money = (minor: number) => `₹${(minor / 100).toFixed(2)}`

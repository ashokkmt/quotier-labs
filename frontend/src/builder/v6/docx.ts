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
  VerticalAlign,
  type ParagraphChild,
} from 'docx'
import { GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'
import type { JSONContent } from '@tiptap/react'
import { isSafeV6Link, starterV6Styles, v6Style, type V6Document, type V6Style } from './model'

const twips = (du: number) => Math.round(du / 5)
const color = (value?: string) => value?.replace(/^#/, '').toUpperCase()
const styleID = (name: string) => `Quotier${name.replace(/\s+/g, '')}`

export async function generateV6Docx(
  document: V6Document,
  fields: Record<string, string> = {},
): Promise<ArrayBuffer> {
  const children = await blocks(document, document.body.content ?? [], 0, fields)
  const portrait = document.settings.orientation === 'portrait'
  const width = twips(portrait ? 59528 : 84189)
  const height = twips(portrait ? 84189 : 59528)
  const headers: { default?: Header; first?: Header } = {}
  const footers: { default?: Footer; first?: Footer } = {}
  if (document.header_story)
    headers.default = new Header({
      children: await blocks(document, document.header_story.content ?? [], 0, fields),
    })
  if (document.footer_story)
    footers.default = new Footer({
      children: await blocks(document, document.footer_story.content ?? [], 0, fields),
    })
  const firstHeaderStory = document.first_page_header_story ?? document.header_story
  const firstFooterStory = document.first_page_footer_story ?? document.footer_story
  if (document.settings.different_first_page && firstHeaderStory)
    headers.first = new Header({
      children: await blocks(document, firstHeaderStory.content ?? [], 0, fields),
    })
  if (document.settings.different_first_page && firstFooterStory)
    footers.first = new Footer({
      children: await blocks(document, firstFooterStory.content ?? [], 0, fields),
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
  fields: Record<string, string> = {},
): Promise<Array<Paragraph | Table>> {
  const output: Array<Paragraph | Table> = []
  for (const node of nodes) {
    if (node.type === 'paragraph') output.push(paragraph(document, node, {}, fields))
    if (node.type === 'pageBreak') output.push(new Paragraph({ children: [new PageBreak()] }))
    if (node.type === 'horizontalRule')
      output.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '6B7280' } },
        }),
      )
    if (node.type === 'table') output.push(await table(document, node, fields))
    if (node.type === 'lineItemTable') output.push(lineItems(document, node))
    if (node.type === 'imageBlock') output.push(await image(node))
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      for (const item of node.content ?? []) {
        for (const child of item.content ?? []) {
          if (child.type === 'paragraph')
            output.push(
              paragraph(
                document,
                child,
                {
                  ...(node.type === 'bulletList'
                    ? { bullet: { level: listLevel } }
                    : { numbering: { reference: 'v6-numbered', level: listLevel } }),
                },
                fields,
              ),
            )
          else output.push(...(await blocks(document, [child], listLevel + 1, fields)))
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
  fields: Record<string, string> = {},
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
    children: inlineChildren(node.content ?? [], style, fields),
    ...extra,
  })
}

function inlineChildren(
  nodes: JSONContent[],
  style: V6Style,
  fields: Record<string, string>,
): ParagraphChild[] {
  return nodes.map((node) => {
    if (node.type === 'hardBreak') return new TextRun({ break: 1 })
    if (node.type === 'pageNumber') return new TextRun({ children: [PageNumber.CURRENT] })
    if (node.type === 'pageCount') return new TextRun({ children: [PageNumber.TOTAL_PAGES] })
    if (node.type === 'field') {
      const value =
        fields[String(node.attrs?.key)] ||
        (node.attrs?.empty_behavior === 'fallback' ? String(node.attrs?.fallback || '') : '')
      return new TextRun({ text: value, ...runStyle(style) })
    }
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

async function table(
  document: V6Document,
  node: JSONContent,
  fields: Record<string, string>,
): Promise<Table> {
  return new Table({
    rows: await Promise.all(
      (node.content ?? []).map(
        async (row) =>
          new TableRow({
            tableHeader: row.content?.every((cell) => cell.type === 'tableHeader'),
            height: Number(row.attrs?.min_height || 0)
              ? { value: twips(Number(row.attrs?.min_height)), rule: HeightRule.ATLEAST }
              : undefined,
            children: await Promise.all(
              (row.content ?? []).map(
                async (cell) =>
                  new TableCell({
                    columnSpan: Number(cell.attrs?.colspan || 1),
                    rowSpan: Number(cell.attrs?.rowspan || 1),
                    verticalAlign:
                      cell.attrs?.vertical_alignment === 'middle'
                        ? VerticalAlign.CENTER
                        : cell.attrs?.vertical_alignment === 'bottom'
                          ? VerticalAlign.BOTTOM
                          : VerticalAlign.TOP,
                    margins: {
                      top: twips(Number(cell.attrs?.padding || node.attrs?.cell_padding || 425)),
                      right: twips(Number(cell.attrs?.padding || node.attrs?.cell_padding || 425)),
                      bottom: twips(Number(cell.attrs?.padding || node.attrs?.cell_padding || 425)),
                      left: twips(Number(cell.attrs?.padding || node.attrs?.cell_padding || 425)),
                    },
                    shading:
                      cell.attrs?.background && cell.attrs.background !== 'transparent'
                        ? { fill: color(String(cell.attrs.background)) }
                        : undefined,
                    children: await blocks(document, cell.content ?? [], 0, fields),
                  }),
              ),
            ),
          }),
      ),
    ),
    width: node.attrs?.width
      ? { size: twips(Number(node.attrs.width)), type: WidthType.DXA }
      : { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(
      String(node.attrs?.border_preset || 'all'),
      color(String(node.attrs?.border_color || '#D1D5DB')) || 'D1D5DB',
    ),
  })
}

function lineItems(document: V6Document, node: JSONContent): Table {
  const rows = Array.isArray(node.attrs?.rows) ? node.attrs.rows : []
  const columns =
    Array.isArray(node.attrs?.columns) && node.attrs.columns.length
      ? node.attrs.columns
      : [
          { key: 'description', label: 'Description' },
          { key: 'quantity', label: 'Qty' },
          { key: 'rate', label: 'Rate' },
          { key: 'tax_rate', label: 'Tax' },
          { key: 'amount', label: 'Amount' },
        ]
  const result = calculateLineItems(rows)
  const values = [
    columns.map((column: any) => String(column.label || column.key)),
    ...rows.map((row: any, index: number) =>
      columns.map((column: any) => lineItemDisplay(column.key, row, result.lines[index])),
    ),
  ]
  if (node.attrs?.show_subtotal) values.push(totalRow('Subtotal', result.subtotal, columns.length))
  if (node.attrs?.show_discount) values.push(totalRow('Discount', result.discount, columns.length))
  if (node.attrs?.show_tax) values.push(totalRow('Tax', result.tax, columns.length))
  if (
    node.attrs?.show_grand_total ||
    !(node.attrs?.show_subtotal || node.attrs?.show_discount || node.attrs?.show_tax)
  )
    values.push(totalRow('Grand total', result.grand, columns.length))
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

const totalRow = (label: string, amount: number, columns: number) =>
  columns === 1
    ? [`${label}: ${money(amount)}`]
    : [label, ...Array(Math.max(0, columns - 2)).fill(''), money(amount)]
const tableBorders = (preset: string, borderColor: string) => {
  const visible = { style: BorderStyle.SINGLE, size: 4, color: borderColor }
  const hidden = { style: BorderStyle.NONE, size: 0, color: borderColor }
  return {
    top: preset === 'none' ? hidden : visible,
    bottom: preset === 'none' ? hidden : visible,
    left: preset === 'none' ? hidden : visible,
    right: preset === 'none' ? hidden : visible,
    insideHorizontal: preset === 'all' ? visible : hidden,
    insideVertical: preset === 'all' ? visible : hidden,
  }
}

function calculateLineItems(rows: any[]) {
  let subtotal = 0,
    discount = 0,
    tax = 0,
    grand = 0
  const lines = rows.map((row) => {
    const base = Math.round(Number(row.quantity || 0) * Number(row.rate || 0))
    const discounted = Math.max(0, base - Number(row.discount || 0))
    const taxable = row.tax_inclusive
      ? Math.round(discounted / (1 + Number(row.tax_rate || 0) / 100))
      : discounted
    const lineTax = row.tax_inclusive
      ? discounted - taxable
      : Math.round((taxable * Number(row.tax_rate || 0)) / 100)
    subtotal += base
    discount += Number(row.discount || 0)
    tax += lineTax
    grand += taxable + lineTax
    return { taxable, tax: lineTax, amount: taxable + lineTax }
  })
  return { subtotal, discount, tax, grand: Math.round(grand / 100) * 100, lines }
}
function lineItemDisplay(
  key: string,
  row: any,
  result: { taxable: number; tax: number; amount: number },
) {
  if (key === 'description') return String(row.description || '')
  if (key === 'quantity') return String(row.quantity || 0)
  if (key === 'rate') return money(Number(row.rate || 0))
  if (key === 'discount') return money(Number(row.discount || 0))
  if (key === 'tax_rate') return `${row.tax_rate || 0}%`
  return money(key === 'taxable' ? result.taxable : key === 'tax' ? result.tax : result.amount)
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
    spacing: {
      before: twips(Number(node.attrs?.space_before || 0)),
      after: twips(Number(node.attrs?.space_after || 0)),
    },
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

import {
  AlignmentType,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { GetImageDataURI } from '../../../wailsjs/go/wails/CompanyHandler'
import type { JSONContent } from '@tiptap/react'
import type { V6Document } from './model'

const twips = (du: number) => Math.round(du / 5)
const color = (value?: string) => value?.replace(/^#/, '').toUpperCase()

export async function generateV6Docx(document: V6Document): Promise<ArrayBuffer> {
  const children: Array<Paragraph | Table> = []
  for (const node of document.body.content ?? []) {
    if (node.type === 'paragraph') children.push(paragraph(node))
    if (node.type === 'pageBreak') children.push(new Paragraph({ children: [new PageBreak()] }))
    if (node.type === 'table') children.push(table(node))
    if (node.type === 'lineItemTable') children.push(lineItems(node))
    if (node.type === 'imageBlock') children.push(await image(node))
  }
  const portrait = document.settings.orientation === 'portrait'
  const width = twips(portrait ? 59528 : 84189)
  const height = twips(portrait ? 84189 : 59528)
  const output = new Document({
    sections: [
      {
        properties: {
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

function paragraph(node: JSONContent): Paragraph {
  const attrs = node.attrs ?? {}
  return new Paragraph({
    alignment:
      attrs.alignment === 'center'
        ? AlignmentType.CENTER
        : attrs.alignment === 'right'
          ? AlignmentType.RIGHT
          : AlignmentType.LEFT,
    spacing: {
      before: twips(Number(attrs.spacing_before ?? 0)),
      after: twips(Number(attrs.spacing_after ?? 0)),
      line: Math.round(Number(attrs.line_height ?? 1.2) * 240),
    },
    indent: {
      left: twips(Number(attrs.left_indent ?? 0)),
      right: twips(Number(attrs.right_indent ?? 0)),
      firstLine: twips(Number(attrs.first_line_indent ?? 0)),
    },
    children: (node.content ?? []).filter((child) => child.type === 'text').map(textRun),
  })
}

function textRun(node: JSONContent): TextRun {
  const options: Record<string, unknown> = { text: node.text ?? '' }
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') options.bold = true
    if (mark.type === 'italic') options.italics = true
    if (mark.type === 'underline') options.underline = {}
    if (mark.type === 'textStyle') {
      if (mark.attrs?.fontFamily) options.font = mark.attrs.fontFamily
      if (mark.attrs?.fontSize) options.size = Math.round(Number(mark.attrs.fontSize) / 50)
      if (mark.attrs?.color) options.color = color(String(mark.attrs.color))
    }
    if (mark.type === 'highlight' && mark.attrs?.color)
      options.shading = { fill: color(String(mark.attrs.color)) }
  }
  return new TextRun(options)
}

function table(node: JSONContent): Table {
  const rows = (node.content ?? []).map(
    (row) =>
      new TableRow({
        children: (row.content ?? []).map(
          (cell) =>
            new TableCell({
              shading:
                cell.attrs?.background && cell.attrs.background !== 'transparent'
                  ? { fill: color(String(cell.attrs.background)) }
                  : undefined,
              children: (cell.content ?? []).map(paragraph),
            }),
        ),
      }),
  )
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
}

function lineItems(node: JSONContent): Table {
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
                  new Paragraph({ children: [new TextRun({ text: value, bold: index === 0 })] }),
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
    alignment:
      node.attrs?.alignment === 'center'
        ? AlignmentType.CENTER
        : node.attrs?.alignment === 'right'
          ? AlignmentType.RIGHT
          : AlignmentType.LEFT,
    children: [new ImageRun({ data: bytes, transformation: { width, height }, type })],
  })
}

const money = (minor: number) => `₹${(minor / 100).toFixed(2)}`

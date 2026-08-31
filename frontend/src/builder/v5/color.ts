import type { V5Document, V5Node } from './model'
import { colorValueToCSS } from './tokens'

export type HSV = { h: number; s: number; v: number }

export function hexToHSV(value: string): HSV {
  const hex = colorValueToCSS(value).replace('#', '')
  const channels = [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToHex({ h, s, v }: HSV): string {
  const chroma = v * s
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - chroma
  const channels =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x]
  return `#${channels
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase()
}

const visitColors = (nodes: V5Node[], output: string[]) => {
  for (const node of nodes) {
    for (const key of ['color', 'fill', 'stroke']) {
      const value = node.props?.[key]
      if (typeof value !== 'string' || value === 'none' || value === 'transparent') continue
      const color = colorValueToCSS(value).toUpperCase()
      if (!output.includes(color)) output.push(color)
    }
    if (node.children?.length) visitColors(node.children, output)
  }
}

export function usedColorsForDocument(document: V5Document): string[] {
  const output: string[] = []
  for (const page of document.root.pages) visitColors(page.children, output)
  for (const master of document.root.masters ?? []) visitColors(master.children, output)
  return output
}

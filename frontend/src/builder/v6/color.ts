export const COLOR_TOKENS = ['black', 'gray', 'white', 'primary', 'danger', 'success'] as const
export type ColorToken = (typeof COLOR_TOKENS)[number]

export const COLOR_HEX: Record<ColorToken, string> = {
  black: '#111827',
  gray: '#6B7280',
  white: '#FFFFFF',
  primary: '#2563EB',
  danger: '#DC2626',
  success: '#16A34A',
}

export const isColorToken = (value: unknown): value is ColorToken =>
  typeof value === 'string' && (COLOR_TOKENS as readonly string[]).includes(value)

export const normalizeColorValue = (value: string): string => {
  if (value === 'transparent' || isColorToken(value)) return value
  const candidate = value.startsWith('#') ? value : `#${value}`
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toUpperCase() : 'black'
}

export const colorValueToCSS = (value: unknown, fallback: ColorToken = 'black'): string => {
  if (value === 'transparent') return 'transparent'
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value
  return COLOR_HEX[isColorToken(value) ? value : fallback]
}

export type HSV = { h: number; s: number; v: number }

export function hexToHSV(value: string): HSV {
  const hex = colorValueToCSS(value).replace('#', '')
  const [r, g, b] = [0, 2, 4].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255,
  )
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

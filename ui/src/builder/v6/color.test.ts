import { describe, expect, it } from 'vitest'
import {
  COLOR_TOKENS,
  colorValueToCSS,
  hexToHSV,
  hsvToHex,
  normalizeColorValue,
} from './color'

describe('document colors', () => {
  it('keeps the palette controlled and rejects arbitrary CSS', () => {
    expect(COLOR_TOKENS).toEqual(['black', 'gray', 'white', 'primary', 'danger', 'success'])
    expect(colorValueToCSS('primary')).toBe('#2563EB')
    expect(normalizeColorValue('ff00aa')).toBe('#FF00AA')
    expect(normalizeColorValue('url(example)')).toBe('black')
  })

  it('round-trips palette colors through HSV', () => {
    for (const color of ['#2F6FED', '#FFFFFF', '#000000']) {
      expect(hsvToHex(hexToHSV(color))).toBe(color)
    }
  })
})

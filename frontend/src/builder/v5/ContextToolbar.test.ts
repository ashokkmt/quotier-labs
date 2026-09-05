import { describe, expect, it } from 'vitest'
import { anchoredToolbarPosition } from './toolbarPosition'

describe('context toolbar placement', () => {
  const viewport = { x: 100, y: 50, width: 600, height: 500 }
  const toolbar = { width: 180, height: 40 }

  it('stays at the canvas top regardless of the selected object', () => {
    expect(
      anchoredToolbarPosition({ x: 300, y: 250, width: 100, height: 50 }, viewport, toolbar),
    ).toEqual({ left: 310, top: 62 })
    expect(
      anchoredToolbarPosition({ x: 40, y: 60, width: 60, height: 30 }, viewport, toolbar),
    ).toEqual({ left: 310, top: 62 })
  })

  it('clamps a wide toolbar inside the canvas viewport', () => {
    expect(
      anchoredToolbarPosition({ x: 300, y: 55, width: 100, height: 460 }, viewport, {
        width: 800,
        height: 40,
      }),
    ).toEqual({ left: 108, top: 62 })
  })
})

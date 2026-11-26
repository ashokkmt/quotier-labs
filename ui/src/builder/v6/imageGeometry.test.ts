import { describe, expect, it } from 'vitest'
import { resizeImageFromHandle } from './imageGeometry'

const start = { width: 7500, height: 5000, offsetX: 0, offsetY: 0 }

describe('image resize geometry', () => {
  it('converts pointer deltas through zoom and preserves the ratio for corners', () => {
    expect(
      resizeImageFromHandle(start, 'se', 20, 0, {
        scale: 2,
        aspectRatio: 2 / 3,
        preserveAspect: true,
        floating: false,
      }),
    ).toEqual({ width: 8250, height: 5500, offsetX: 0, offsetY: 0 })
  })

  it('keeps edge handles on a single axis', () => {
    expect(
      resizeImageFromHandle(start, 'e', 20, 40, {
        scale: 1,
        aspectRatio: 2 / 3,
        preserveAspect: true,
        floating: true,
      }),
    ).toEqual({ width: 9000, height: 5000, offsetX: 0, offsetY: 0 })
  })

  it('keeps the opposite edge fixed for floating west and north handles', () => {
    expect(
      resizeImageFromHandle(start, 'nw', 10, 10, {
        scale: 1,
        aspectRatio: 2 / 3,
        preserveAspect: false,
        floating: true,
      }),
    ).toEqual({ width: 6750, height: 4250, offsetX: 750, offsetY: 750 })
  })

  it('clamps dimensions to controlled bounds', () => {
    expect(
      resizeImageFromHandle(start, 'se', -10000, -10000, {
        scale: 1,
        aspectRatio: 2 / 3,
        preserveAspect: false,
        floating: false,
      }),
    ).toEqual({ width: 100, height: 100, offsetX: 0, offsetY: 0 })
  })
})

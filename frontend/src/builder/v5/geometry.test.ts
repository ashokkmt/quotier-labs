import { describe, expect, it } from 'vitest'
import {
  apply,
  bounds,
  corners,
  documentToViewport,
  invert,
  multiply,
  quantizeGeometry,
  rotate,
  translate,
  viewportToDocument,
} from './geometry'
import { du } from './model'

describe('V5 geometry kernel', () => {
  it('composes and inverts transforms', () => {
    const m = multiply(translate(10, 20), rotate(90))
    const p = apply(m, { x: 2, y: 0 })
    const restored = apply(invert(m), p)
    expect(restored.x).toBeCloseTo(2)
    expect(restored.y).toBeCloseTo(0)
  })
  it('computes rotated AABB and quantizes commits', () => {
    const c = corners({ x: du(0), y: du(0), width: du(100), height: du(50), rotation: 90 })
    expect(bounds(c).width).toBeCloseTo(50)
    expect(
      quantizeGeometry({
        x: 1.4 as never,
        y: 2.6 as never,
        width: 10.2 as never,
        height: 20.8 as never,
        rotation: 4.6,
      }),
    ).toEqual({ x: 1, y: 3, width: 10, height: 21, rotation: 5 })
  })
  it('round-trips viewport coordinates', () => {
    const p = { x: 120, y: 80 }
    expect(
      documentToViewport(viewportToDocument(p, 2, { x: 10, y: 20 }), 2, { x: 10, y: 20 }),
    ).toEqual(p)
  })
})

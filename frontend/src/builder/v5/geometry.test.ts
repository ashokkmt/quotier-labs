import { describe, expect, it } from 'vitest'
import {
  apply,
  bounds,
  corners,
  documentToViewport,
  geometryMatrix,
  invert,
  multiply,
  polygonsOverlap,
  quantizeGeometry,
  rectPolygon,
  resizeKeepingTopLeft,
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
    const c = corners({ x: du(0), y: du(0), width: du(100), height: du(50), rotation: 9000 })
    expect(bounds(c).width).toBeCloseTo(50)
    expect(bounds(c)).toMatchObject({ x: 25, y: -25, width: 50, height: 100 })
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
  it('detects every positive marquee overlap without selecting edge-only contact', () => {
    const marquee = rectPolygon({ x: 0, y: 0, width: 10, height: 10 })
    expect(polygonsOverlap(marquee, rectPolygon({ x: 9, y: 9, width: 10, height: 10 }))).toBe(true)
    expect(polygonsOverlap(marquee, rectPolygon({ x: 2, y: 2, width: 2, height: 2 }))).toBe(true)
    expect(polygonsOverlap(marquee, rectPolygon({ x: -2, y: 4, width: 14, height: 2 }))).toBe(true)
    expect(
      polygonsOverlap(marquee, corners({ x: 8, y: 2, width: 4, height: 4, rotation: 4500 })),
    ).toBe(true)
    expect(polygonsOverlap(marquee, rectPolygon({ x: 10, y: 0, width: 4, height: 4 }))).toBe(false)
    expect(polygonsOverlap(marquee, rectPolygon({ x: 11, y: 0, width: 4, height: 4 }))).toBe(false)
  })
  it('resizes rotated intrinsic text without moving its transformed top-left anchor', () => {
    const before = { x: 100, y: 200, width: 300, height: 100, rotation: 4500 }
    const origin = apply(geometryMatrix(before), { x: 0, y: 0 })
    const after = resizeKeepingTopLeft(before, 500, 240)
    const nextOrigin = apply(geometryMatrix(after), { x: 0, y: 0 })
    expect(nextOrigin.x).toBeCloseTo(origin.x, 0)
    expect(nextOrigin.y).toBeCloseTo(origin.y, 0)
  })
})

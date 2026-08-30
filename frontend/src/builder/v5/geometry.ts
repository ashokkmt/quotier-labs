import { du, type DocumentUnit, type V5Geometry } from './model'

export type Point = { x: number; y: number }
export type Matrix = [number, number, number, number, number, number]
export type Bounds = { x: number; y: number; width: number; height: number }
export const identity: Matrix = [1, 0, 0, 1, 0, 0]
export const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]
export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y]
export const rotate = (degrees: number): Matrix => {
  const r = (degrees * Math.PI) / 180
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
}
export const apply = (m: Matrix, p: Point): Point => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
})
export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2]
  if (Math.abs(det) < 1e-9) throw new Error('singular transform')
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]
}
export const geometryMatrix = (g: V5Geometry): Matrix =>
  // Document rotation is stored in hundredths of a degree; screen/geometry math uses degrees.
  multiply(
    translate(g.x + g.width / 2, g.y + g.height / 2),
    multiply(rotate(g.rotation / 100), translate(-g.width / 2, -g.height / 2)),
  )

/** Recovers the authored unrotated box position from a rigid center-origin matrix. */
export function geometryPositionFromMatrix(
  matrix: Matrix,
  width: number,
  height: number,
  rotation: number,
): Point {
  const origin = apply(matrix, { x: 0, y: 0 })
  const center = { x: width / 2, y: height / 2 }
  const rotatedCenter = apply(rotate(rotation / 100), center)
  return {
    x: origin.x - center.x + rotatedCenter.x,
    y: origin.y - center.y + rotatedCenter.y,
  }
}
export function corners(g: V5Geometry, parent: Matrix = identity): Point[] {
  const m = multiply(parent, geometryMatrix(g))
  return [
    apply(m, { x: 0, y: 0 }),
    apply(m, { x: g.width, y: 0 }),
    apply(m, { x: g.width, y: g.height }),
    apply(m, { x: 0, y: g.height }),
  ]
}
export function bounds(points: Point[]): Bounds {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y)
  const x = Math.min(...xs),
    y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}
export const quantizeGeometry = (g: V5Geometry): V5Geometry => ({
  x: du(g.x) as DocumentUnit,
  y: du(g.y) as DocumentUnit,
  width: du(g.width) as DocumentUnit,
  height: du(g.height) as DocumentUnit,
  rotation: Math.round(g.rotation),
})
export const viewportToDocument = (point: Point, zoom: number, pan: Point): Point => ({
  x: (point.x - pan.x) / zoom,
  y: (point.y - pan.y) / zoom,
})
export const documentToViewport = (point: Point, zoom: number, pan: Point): Point => ({
  x: point.x * zoom + pan.x,
  y: point.y * zoom + pan.y,
})

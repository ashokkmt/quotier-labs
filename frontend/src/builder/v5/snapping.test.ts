import { describe, expect, it } from 'vitest'
import { distribute, snapRect, snapResize } from './snapping'
describe('V5 snapping', () => {
  it('selects the minimum visible correction and excludes hidden candidates', () => {
    expect(
      snapRect(
        { id: 'a', x: 101, y: 100, width: 20, height: 20 },
        [
          { id: 'hidden', x: 100, y: 100, width: 20, height: 20, visible: false },
          { id: 'b', x: 100, y: 200, width: 20, height: 20 },
        ],
        6,
      ).dx,
    ).toBe(-1)
  })
  it('distributes interior objects while preserving outer positions', () => {
    expect(
      distribute('x', [
        { id: 'a', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', x: 30, y: 0, width: 10, height: 10 },
        { id: 'c', x: 100, y: 0, width: 10, height: 10 },
      ]).b,
    ).toBe(50)
  })
  it('acquires an equal-spacing relationship between sibling objects', () => {
    const result = snapRect(
      { id: 'moving', x: 31, y: 0, width: 10, height: 10 },
      [
        { id: 'left', x: 0, y: 0, width: 10, height: 10 },
        { id: 'right', x: 60, y: 0, width: 10, height: 10 },
        { id: '__page__', x: 0, y: 0, width: 100, height: 100 },
      ],
      6,
    )
    expect(result.dx).toBe(-1)
    expect(result.guides.some((guide) => guide.kind === 'spacing')).toBe(true)
  })
  it('snaps a moving resize edge and matches a sibling dimension', () => {
    const edge = snapResize(
      { id: 'a', x: 0, y: 0, width: 19, height: 10 },
      { right: true },
      [{ id: 'b', x: 40, y: 0, width: 20, height: 10 }],
      2,
    )
    expect(edge.rect.width).toBe(20)
    expect(edge.guides.some((guide) => guide.kind === 'size')).toBe(true)
  })
})

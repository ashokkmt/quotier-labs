import { describe, expect, it } from 'vitest'
import { distribute, snapRect } from './snapping'
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
    ).toBe(45)
  })
})

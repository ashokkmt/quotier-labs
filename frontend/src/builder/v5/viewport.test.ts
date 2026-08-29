import { describe, expect, it } from 'vitest'
import { emptyV5Fixture } from './fixtures'
import { fitPage, panBy, zoomAt } from './viewport'

describe('V5 viewport', () => {
  it('fits a page and preserves anchor while zooming', () => {
    const fitted = fitPage(emptyV5Fixture(), 800, 1000)
    const zoomed = zoomAt(fitted, fitted.zoom * 2, { x: 200, y: 200 })
    expect(zoomed.zoom).toBe(fitted.zoom * 2)
    expect(panBy(zoomed, { x: 5, y: -3 }).pan).toEqual({ x: zoomed.pan.x + 5, y: zoomed.pan.y - 3 })
  })
})

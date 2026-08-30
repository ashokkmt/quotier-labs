import { describe, expect, it } from 'vitest'
import { anchorAt, contentPointForAnchor, layoutPageStack, PAGE_GAP_PX } from './pageStack'

const pages = [
  { id: 'one', width: 600, height: 800 },
  { id: 'two', width: 600, height: 800 },
]

describe('page stack layout', () => {
  it('keeps gaps in screen pixels and fills a larger viewport', () => {
    const small = layoutPageStack(pages, 0.5, { width: 1200, height: 900 })
    const large = layoutPageStack(pages, 2, { width: 1200, height: 900 })
    expect(small.width).toBe(1200)
    expect(small.height).toBeGreaterThanOrEqual(900)
    expect(small.pages[1].top - (small.pages[0].top + small.pages[0].height)).toBe(PAGE_GAP_PX)
    expect(large.pages[1].top - (large.pages[0].top + large.pages[0].height)).toBe(PAGE_GAP_PX)
  })

  it('round trips a pointer anchor on a page and in the page gap', () => {
    const before = layoutPageStack(pages, 1, { width: 1000, height: 700 })
    const pointer = { x: before.pages[1].left + 125, y: before.pages[1].top + 240 }
    const anchor = anchorAt(before, pages, 1, pointer)!
    const after = layoutPageStack(pages, 1.75, { width: 1000, height: 700 })
    expect(contentPointForAnchor(after, anchor, 1.75)).toEqual({
      x: after.pages[1].left + 125 * 1.75,
      y: after.pages[1].top + 240 * 1.75,
    })

    const gap = { x: before.pages[0].left, y: before.pages[0].top + before.pages[0].height + 10 }
    expect(anchorAt(before, pages, 1, gap)).not.toBeNull()
  })
})

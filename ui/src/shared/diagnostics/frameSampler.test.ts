import { describe, expect, it } from 'vitest'
import { summarizeFrameIntervals } from './frameSampler'
describe('summarizeFrameIntervals', () => {
  it('reports a bounded aggregate rather than individual frames', () => {
    expect(summarizeFrameIntervals([10, 16, 18, 40])).toEqual({
      frameCount: 4,
      medianMS: 16,
      p95MS: 40,
      maxMS: 40,
      slowFrameCount: 1,
    })
  })
  it('does nothing when no recording window has frames', () =>
    expect(summarizeFrameIntervals([])).toBeNull())
})

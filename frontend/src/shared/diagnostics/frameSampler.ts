export type FrameSummary = {
  frameCount: number
  medianMS: number
  p95MS: number
  maxMS: number
  slowFrameCount: number
}

export function summarizeFrameIntervals(
  intervals: number[],
  displayIntervalMS = 1000 / 60,
): FrameSummary | null {
  if (!intervals.length) return null
  const sorted = [...intervals].sort((a, b) => a - b)
  const percentile = (n: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * n) - 1)]
  return {
    frameCount: sorted.length,
    medianMS: percentile(0.5),
    p95MS: percentile(0.95),
    maxMS: sorted[sorted.length - 1],
    slowFrameCount: sorted.filter((value) => value > displayIntervalMS * 1.5).length,
  }
}

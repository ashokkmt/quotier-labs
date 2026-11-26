import { useEffect } from 'react'
import {
  GetDiagnosticsStatus,
  RecordFrontendDiagnostics,
} from '../../../wailsjs/go/wails/DiagnosticsHandler'
import { summarizeFrameIntervals } from './frameSampler'

// The rAF loop exists only while a developer explicitly records diagnostics.
// It aggregates five seconds of timing data, never coordinates or frame traces.
export function useFrontendDiagnostics(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let raf = 0
    let previous = 0
    let sentAt = performance.now()
    let intervals: number[] = []
    const tick = (now: number) => {
      if (disposed) return
      if (previous) intervals.push(now - previous)
      previous = now
      if (now - sentAt >= 5000) {
        const summary = summarizeFrameIntervals(intervals)
        if (summary) {
          void RecordFrontendDiagnostics('canvas.frame_timing', now - sentAt, {
            frame_count: summary.frameCount,
            median_ms: Math.round(summary.medianMS),
            p95_ms: Math.round(summary.p95MS),
            max_ms: Math.round(summary.maxMS),
            slow_frame_count: summary.slowFrameCount,
          }).catch(() => undefined)
        }
        sentAt = now
        intervals = []
      }
      raf = requestAnimationFrame(tick)
    }
    const activate = async () => {
      try {
        const status = await GetDiagnosticsStatus()
        if (!disposed && status.recording) raf = requestAnimationFrame(tick)
      } catch {
        /* browser tests and normal web development have no Wails bridge */
      }
    }
    void activate()
    const refresh = window.setInterval(() => {
      void GetDiagnosticsStatus()
        .then((status) => {
          if (disposed) return
          if (status.recording && !raf) raf = requestAnimationFrame(tick)
          if (!status.recording && raf) {
            cancelAnimationFrame(raf)
            raf = 0
            previous = 0
            intervals = []
          }
        })
        .catch(() => undefined)
    }, 2000)
    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      window.clearInterval(refresh)
    }
  }, [enabled])
}

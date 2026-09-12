import { describe, expect, it } from 'vitest'
import { createSerialTask } from './useAutosave'

describe('autosave serialization', () => {
  it('never overlaps saves and continues after a failed save', async () => {
    let active = 0
    let maxActive = 0
    const order: string[] = []
    const save = createSerialTask(async (value: number) => {
      active++
      maxActive = Math.max(maxActive, active)
      order.push(`start-${value}`)
      await Promise.resolve()
      active--
      order.push(`end-${value}`)
      if (value === 1) throw new Error('first save failed')
    })

    await Promise.allSettled([save(1), save(2), save(3)])

    expect(maxActive).toBe(1)
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3'])
  })
})

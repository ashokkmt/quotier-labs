import { describe, expect, it } from 'vitest'
import { boundedNumberValue } from './boundedNumber'

describe('boundedNumberValue', () => {
  it('accepts complete numbers and clamps their bounds', () => {
    expect(boundedNumberValue('20', 8, 72)).toBe(20)
    expect(boundedNumberValue('1', 8, 72)).toBe(8)
    expect(boundedNumberValue('100', 8, 72)).toBe(72)
    expect(boundedNumberValue('', 8, 72)).toBeNull()
    expect(boundedNumberValue('not a number', 8, 72)).toBeNull()
  })
})

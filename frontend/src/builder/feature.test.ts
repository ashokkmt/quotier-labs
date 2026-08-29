import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFreeformV5Enabled } from './feature'

describe('freeform V5 capability', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('is disabled unless explicitly enabled', () => {
    vi.stubEnv('VITE_FREEFORM_V5', '')
    expect(isFreeformV5Enabled()).toBe(false)
  })
  it('is disabled for any value other than the literal true', () => {
    vi.stubEnv('VITE_FREEFORM_V5', '1')
    expect(isFreeformV5Enabled()).toBe(false)
  })
  it('enables only with the literal true', () => {
    vi.stubEnv('VITE_FREEFORM_V5', 'true')
    expect(isFreeformV5Enabled()).toBe(true)
  })
})

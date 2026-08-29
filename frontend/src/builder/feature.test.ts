import { describe, expect, it } from 'vitest'
import { isFreeformV5Enabled } from './feature'

describe('freeform V5 capability', () => {
  it('is disabled by default', () => expect(isFreeformV5Enabled()).toBe(false))
})

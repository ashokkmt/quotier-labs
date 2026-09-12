import { describe, expect, it } from 'vitest'
import { sanitizeV6Paste } from './extensions'

describe('V6 paste guard', () => {
  it('removes executable, arbitrary style, and external image content', () => {
    const clean = sanitizeV6Paste(
      '<p style="position:fixed" onclick="bad()">Safe<script>bad()</script><img src="https://example.com/x.png"></p>',
    )
    expect(clean).toBe('<p>Safe</p>')
  })
})

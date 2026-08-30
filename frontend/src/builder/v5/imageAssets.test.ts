import { describe, expect, it } from 'vitest'
import { readValidatedImage, V5_IMAGE_MAX_BYTES } from './imageAssets'

describe('V5 image asset validation', () => {
  it('rejects script-capable and unknown image formats before decoding', async () => {
    await expect(readValidatedImage({ type: 'image/svg+xml', size: 32 } as File)).rejects.toThrow(
      /PNG, JPEG, or WebP/,
    )
  })

  it('rejects oversized image input before decoding', async () => {
    await expect(
      readValidatedImage({ type: 'image/png', size: V5_IMAGE_MAX_BYTES + 1 } as File),
    ).rejects.toThrow(/up to 5 MB/)
  })
})

import { describe, expect, it } from 'vitest'
import { fitImageSize, readValidatedImage, V5_IMAGE_MAX_BYTES } from './imageAssets'

describe('V5 image asset validation', () => {
  it('fits landscape and portrait sources completely inside the insertion frame', () => {
    expect(fitImageSize(2936, 1470, 12000, 12000)).toEqual({ width: 12000, height: 6008 })
    expect(fitImageSize(1000, 2000, 12000, 12000)).toEqual({ width: 6000, height: 12000 })
  })

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

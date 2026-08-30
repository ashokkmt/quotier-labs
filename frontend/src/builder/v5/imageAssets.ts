export const V5_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const V5_IMAGE_MAX_DIMENSION = 10_000
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type ValidatedImageAsset = {
  source: string
  width: number
  height: number
}

function readDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Validates browser image input and normalizes WebP to PNG because the authoritative Go PDF
 * renderer deliberately accepts only its deterministic PNG/JPEG subset.
 */
export async function readValidatedImage(file: File): Promise<ValidatedImageAsset> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size > V5_IMAGE_MAX_BYTES)
    throw new Error('Choose a PNG, JPEG, or WebP image up to 5 MB.')

  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width > V5_IMAGE_MAX_DIMENSION || bitmap.height > V5_IMAGE_MAX_DIMENSION)
      throw new Error('Image dimensions must be 10,000 px or smaller.')

    let normalized: Blob = file
    if (file.type === 'image/webp') {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('The image could not be converted for PDF output.')
      context.drawImage(bitmap, 0, 0)
      normalized = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be converted.'))),
          'image/png',
        ),
      )
      if (normalized.size > V5_IMAGE_MAX_BYTES)
        throw new Error('The PDF-safe converted image exceeds the 5 MB limit.')
    }

    return { source: await readDataURL(normalized), width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

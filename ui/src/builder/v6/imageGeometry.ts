export type ImageHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export type ImageGeometry = {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

const MIN_IMAGE_SIZE = 100
const MAX_IMAGE_SIZE = 84189

const clampSize = (value: number) =>
  Math.max(MIN_IMAGE_SIZE, Math.min(MAX_IMAGE_SIZE, Math.round(value)))

/** Convert pointer movement to document units before applying resize constraints. */
export function resizeImageFromHandle(
  start: ImageGeometry,
  handle: ImageHandle,
  deltaX: number,
  deltaY: number,
  options: { scale: number; aspectRatio: number; preserveAspect: boolean; floating: boolean },
): ImageGeometry {
  const x = (deltaX / Math.max(0.1, options.scale)) * 75
  const y = (deltaY / Math.max(0.1, options.scale)) * 75
  let width = start.width + (handle.includes('e') ? x : handle.includes('w') ? -x : 0)
  let height = start.height + (handle.includes('s') ? y : handle.includes('n') ? -y : 0)

  if (options.preserveAspect && handle.length === 2) {
    if (Math.abs(x) >= Math.abs(y)) height = width * options.aspectRatio
    else width = height / options.aspectRatio
  }

  width = clampSize(width)
  height = clampSize(height)
  const actualX = start.width - width
  const actualY = start.height - height

  return {
    width,
    height,
    offsetX: start.offsetX + (options.floating && handle.includes('w') ? actualX : 0),
    offsetY: start.offsetY + (options.floating && handle.includes('n') ? actualY : 0),
  }
}

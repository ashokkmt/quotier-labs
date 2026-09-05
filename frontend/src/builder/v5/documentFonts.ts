import { GetDocumentFonts } from '../../../wailsjs/go/wails/DocumentHandler'

type DocumentFontAsset = {
  family: string
  weight: number
  style: 'normal' | 'italic'
  data: string
}

let loading: Promise<void> | null = null

/** Loads the same immutable TTF bytes used by the PDF adapter before the editor first paints. */
export function loadDocumentFonts(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    if (typeof FontFace === 'undefined' || !globalThis.document?.fonts) return
    const assets = (await GetDocumentFonts()) as DocumentFontAsset[]
    const faces = assets.map(
      (asset) =>
        new FontFace(asset.family, `url(data:font/ttf;base64,${asset.data}) format('truetype')`, {
          weight: String(asset.weight),
          style: asset.style,
          display: 'block',
        }),
    )
    const loaded = await Promise.all(faces.map((face) => face.load()))
    loaded.forEach((face) => globalThis.document.fonts.add(face))
    await globalThis.document.fonts.ready
  })().catch((error) => {
    loading = null
    throw error
  })
  return loading
}

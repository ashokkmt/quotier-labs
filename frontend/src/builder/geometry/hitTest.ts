import type { BuilderNode } from '../document/model'
export type GeometryProvider = {
  elementFromPoint: (x: number, y: number) => Element | null
  rectFor: (nodeId: string) => DOMRect | undefined
}
export class RectCache {
  private readonly rects = new Map<string, DOMRect>()
  private valid = false
  invalidate() {
    this.valid = false
    this.rects.clear()
  }
  read(nodeId: string, read: () => DOMRect | undefined) {
    if (!this.valid) {
      const rect = read()
      if (rect) this.rects.set(nodeId, rect)
    }
    return this.rects.get(nodeId)
  }
  beginFrame() {
    this.valid = true
  }
}
export function hitDropZone(
  provider: GeometryProvider,
  x: number,
  y: number,
  nodes: Record<string, BuilderNode>,
) {
  let element = provider.elementFromPoint(x, y)
  while (element) {
    const id = element instanceof HTMLElement ? element.dataset.builderNode : undefined
    if (id && nodes[id]) return id
    element = element.parentElement
  }
  return null
}

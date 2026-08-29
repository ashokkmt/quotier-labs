import { du, type V5Node, type V5Page } from './model'

export type Placement = { x: number; y: number; fallback: boolean }
type Rect = { x: number; y: number; width: number; height: number }
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

export function findPlacement(
  page: V5Page,
  size: Pick<Rect, 'width' | 'height'>,
  preferred: { x: number; y: number },
  occupied: Rect[],
): Placement | null {
  const left = page.margin.left,
    top = page.margin.top,
    right = page.width - page.margin.right,
    bottom = page.height - page.margin.bottom
  const candidates: Placement[] = [{ x: preferred.x, y: preferred.y, fallback: false }]
  for (let step = 1200; step <= 12000; step += 1200)
    candidates.push(
      { x: preferred.x + step, y: preferred.y + step, fallback: false },
      { x: preferred.x + step, y: preferred.y, fallback: false },
      { x: preferred.x, y: preferred.y + step, fallback: false },
    )
  for (const candidate of candidates)
    if (
      candidate.x >= left &&
      candidate.y >= top &&
      candidate.x + size.width <= right &&
      candidate.y + size.height <= bottom &&
      !occupied.some((rect) => overlaps({ ...candidate, ...size }, rect))
    )
      return { x: du(candidate.x), y: du(candidate.y), fallback: false }
  const fallback = {
    x: Math.max(left, Math.min(right - size.width, preferred.x)),
    y: Math.max(top, Math.min(bottom - size.height, preferred.y)),
  }
  return fallback.x + size.width <= right && fallback.y + size.height <= bottom
    ? { x: du(fallback.x), y: du(fallback.y), fallback: true }
    : null
}

export function cloneNode(
  node: V5Node,
  nextID: (prefix: string) => string,
  offset = { x: 1200, y: 1200 },
): V5Node {
  const id = nextID('node')
  const children = node.children?.map((child) => cloneNode(child, nextID, { x: 0, y: 0 }))
  return {
    ...node,
    id,
    geometry: {
      ...node.geometry,
      x: du(node.geometry.x + offset.x),
      y: du(node.geometry.y + offset.y),
    },
    child_ids: children?.map((child) => child.id),
    children,
  }
}

import { du, type V5Document, type V5Node, type V5Story } from './model'

export const createStory = (id: string, kind: V5Story['kind'], content: unknown): V5Story => ({
  id,
  kind,
  content,
})
export const createFlowFrame = (
  id: string,
  storyId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): V5Node => ({
  id,
  kind: 'flow-frame',
  role: 'flow-frame',
  geometry: { x: du(x), y: du(y), width: du(width), height: du(height), rotation: 0 },
  layout_mode: 'flow-frame',
  locked: false,
  visibility: 'shown',
  optional: false,
  story_id: storyId,
  continuation: 'manual',
})
export function validateStoryChains(document: V5Document): string | null {
  const frames = document.root.pages
    .flatMap((page) => flatten(page.children))
    .filter((node) => node.role === 'flow-frame')
  const byID = new Map(frames.map((frame) => [frame.id, frame]))
  for (const frame of frames) {
    const seen = new Set<string>()
    let current: V5Node | undefined = frame
    while (current?.next_frame_id) {
      if (seen.has(current.id)) return `flow frame cycle at ${frame.id}`
      seen.add(current.id)
      const next = byID.get(current.next_frame_id)
      if (!next || next.story_id !== frame.story_id) return `invalid continuation from ${frame.id}`
      current = next
    }
  }
  return null
}
export function storyOverset(story: V5Story, frames: V5Node[]): boolean {
  const content = story.content as { rows?: unknown[]; text?: string }
  const capacity = frames.reduce(
    (sum, frame) => sum + Math.max(1, Math.floor(frame.geometry.height / 1200)),
    0,
  )
  return (content.rows?.length ?? Math.ceil((content.text?.length ?? 0) / 80)) > capacity
}
export function continuationPolicy(
  document: V5Document,
  frameId: string,
): { masterId?: string; autoPages: boolean } | null {
  const page = document.root.pages.find((item) =>
    flatten(item.children).some((node) => node.id === frameId),
  )
  const frame = page && flatten(page.children).find((node) => node.id === frameId)
  if (!frame || frame.role !== 'flow-frame') return null
  return {
    masterId: page.master_id ?? document.settings.default_master_id,
    autoPages: frame.continuation === 'auto-pages',
  }
}
export function applyPageMaster(document: V5Document, pageId: string, masterId: string) {
  if (!document.root.masters?.some((item) => item.id === masterId))
    throw new Error('unknown master')
  const page = document.root.pages.find((item) => item.id === pageId)
  if (!page) throw new Error('unknown page')
  page.master_id = masterId
  return document
}
function flatten(nodes: V5Node[]): V5Node[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])])
}

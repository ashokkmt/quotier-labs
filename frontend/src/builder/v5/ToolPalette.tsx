import { useState } from 'react'
import { useV5Session } from './store'
import { insertNode, insertStoryFrame } from './commands'
import { findPlacement } from './placement'
import { createStory } from './stories'
import { V5_TOOL_PRESETS, type V5ToolPreset } from './tokens'
import { du, type V5Node } from './model'

const newNodeID = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

function buildStory(preset: V5ToolPreset, storyId: string) {
  if (preset.id === 'table')
    return createStory(storyId, 'table', {
      headers: ['Item', 'Qty', 'Rate'],
      rows: [
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
      ],
    })
  return createStory(storyId, 'rich-text', { text: 'Long text content flows through frames.' })
}

export function ToolPalette() {
  const session = useV5Session()
  const [notice, setNotice] = useState<string | null>(null)

  const addPreset = (preset: V5ToolPreset) => {
    const page = session.document.root.pages[0]
    const preferred = { x: du(page.margin.left + 2400), y: du(page.margin.top + 2400) }
    const occupied = page.children.map((node) => node.geometry)
    const placement = findPlacement(page, preset.size, preferred, occupied)
    if (!placement) {
      setNotice(`No space left on page for ${preset.label}`)
      return
    }
    const node: V5Node = {
      id: newNodeID(preset.id),
      kind: preset.kind,
      role: preset.role,
      name: preset.label,
      geometry: {
        x: placement.x,
        y: placement.y,
        width: preset.size.width,
        height: preset.size.height,
        rotation: 0,
      },
      layout_mode: preset.layoutMode,
      locked: false,
      visibility: 'shown',
      optional: false,
      props: preset.props ? { ...preset.props } : undefined,
      ...(preset.role === 'flow-frame'
        ? { story_id: '', continuation: 'auto-pages' as const }
        : {}),
    }
    if (node.role === 'flow-frame') {
      const storyId = newNodeID('story')
      node.story_id = storyId
      session.execute(insertStoryFrame(page.id, node, buildStory(preset, storyId)))
    } else {
      session.execute(insertNode(page.id, node))
    }
    session.selectNode(node.id)
    setNotice(placement.fallback ? `${preset.label} placed over existing content` : null)
  }

  return (
    <aside aria-label="Insert tools" className="w-40 shrink-0 border-r bg-background p-2 space-y-4">
      <div>
        <p className="px-1 pb-1 text-xs font-semibold uppercase text-muted-foreground">Tools</p>
        <ul className="space-y-1">
          {V5_TOOL_PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => addPreset(preset)}
                className="w-full rounded border border-transparent px-2 py-1.5 text-left text-sm hover:border-border hover:bg-accent"
              >
                {preset.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p aria-live="polite" className="px-1 text-xs text-muted-foreground">
        {notice}
      </p>
    </aside>
  )
}

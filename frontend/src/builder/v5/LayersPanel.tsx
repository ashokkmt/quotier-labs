import { useState } from 'react'
import {
  reorderExtreme,
  reorderNode,
  renameNode,
  reparentNode,
  setNodeLocked,
  setNodeVisibility,
} from './commands'
import { useV5Session } from './store'
import { isEffectivelyHidden, isEffectivelyLocked } from './selectors'
import type { V5Node } from './model'

function Layer({
  node,
  siblings,
  depth = 0,
}: {
  node: V5Node
  siblings: V5Node[]
  depth?: number
}) {
  const session = useV5Session()
  const selected = session.selectedNodeIds.includes(node.id)
  const index = siblings.indexOf(node)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(node.name ?? node.kind)
  const [dropTarget, setDropTarget] = useState(false)
  const locked = isEffectivelyLocked(session.document, node.id)
  const hidden = isEffectivelyHidden(session.document, node.id)
  const label = node.name ?? node.kind

  return (
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-label={label}
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/v5-node-id', node.id)}
      onDragOver={(event) => {
        if (node.role === 'group' && !locked) {
          event.preventDefault()
          setDropTarget(true)
        }
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDropTarget(false)
        const source = event.dataTransfer.getData('text/v5-node-id')
        if (source && source !== node.id && node.role === 'group') {
          try {
            session.execute(reparentNode(source, node.id))
            session.selectNode(source)
          } catch {
            /* invalid reparent target */
          }
        }
      }}
    >
      <div
        className="flex items-center gap-0.5"
        style={{
          paddingLeft: 8 + depth * 12,
          background: selected ? '#dbeafe' : dropTarget ? '#dcfce7' : 'transparent',
          opacity: hidden ? 0.55 : 1,
        }}
      >
        {editing ? (
          <input
            aria-label="Layer name"
            value={name}
            className="min-w-0 flex-1 rounded border px-1 text-xs"
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              session.execute(renameNode(node.id, name))
              setEditing(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                session.execute(renameNode(node.id, name))
                setEditing(false)
              }
              if (event.key === 'Escape') setEditing(false)
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            aria-pressed={selected}
            title={locked ? `${label} (locked)` : label}
            onClick={() => session.selectNode(node.id)}
            onDoubleClick={() => node.role === 'group' && session.enterGroup(node.id)}
            className="min-w-0 flex-1 truncate text-left text-xs"
          >
            {node.role === 'group' ? '▾ ' : ''}
            {label}
            {locked ? ' 🔒' : ''}
          </button>
        )}
        <button
          type="button"
          aria-label={node.visibility === 'shown' ? `Hide ${label}` : `Show ${label}`}
          className="px-0.5 text-xs"
          onClick={() =>
            session.execute(
              setNodeVisibility(node.id, node.visibility === 'shown' ? 'hidden' : 'shown'),
            )
          }
        >
          {node.visibility === 'shown' ? '◉' : '○'}
        </button>
        <button
          type="button"
          aria-label={node.locked ? `Unlock ${label}` : `Lock ${label}`}
          className="px-0.5 text-xs"
          onClick={() => session.execute(setNodeLocked(node.id, !node.locked))}
        >
          {node.locked ? '🔒' : '🔓'}
        </button>
        <button
          type="button"
          aria-label={`Rename ${label}`}
          className="px-0.5 text-xs"
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
        <button
          type="button"
          aria-label={`Send ${label} backward`}
          disabled={index === 0 || locked}
          className="px-0.5 text-xs disabled:opacity-30"
          onClick={() => session.execute(reorderNode(node.id, index - 1))}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label={`Bring ${label} forward`}
          disabled={index === siblings.length - 1 || locked}
          className="px-0.5 text-xs disabled:opacity-30"
          onClick={() => session.execute(reorderNode(node.id, index + 1))}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Send ${label} to back`}
          disabled={locked}
          className="px-0.5 text-xs disabled:opacity-30"
          onClick={() => session.execute(reorderExtreme(node.id, 'back'))}
        >
          ⇩
        </button>
        <button
          type="button"
          aria-label={`Bring ${label} to front`}
          disabled={locked}
          className="px-0.5 text-xs disabled:opacity-30"
          onClick={() => session.execute(reorderExtreme(node.id, 'front'))}
        >
          ⇧
        </button>
      </div>
      {node.children?.length ? (
        <ul role="group">
          {[...node.children].reverse().map((child) => (
            <Layer key={child.id} node={child} siblings={node.children!} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function LayersPanel() {
  const session = useV5Session()
  const activePage = session.document.root.pages.find((page) => page.id === session.activePageId)
  return (
    <nav aria-label="Layers" data-v5-layers className="p-2">
      <div className="flex items-center justify-between pb-1">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Layers</p>
        {session.editScopeId && (
          <button
            type="button"
            className="rounded border px-1.5 py-0.5 text-xs hover:bg-accent"
            onClick={() => session.exitGroup()}
          >
            Exit group
          </button>
        )}
      </div>
      <ul role="tree" aria-label={`Layers of active page`}>
        {activePage
          ? [...activePage.children]
              .reverse()
              .map((node) => <Layer key={node.id} node={node} siblings={activePage.children} />)
          : null}
      </ul>
    </nav>
  )
}

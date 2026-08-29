import { renameNode, reorderNode, setNodeLocked, setNodeVisibility } from './commands'
import { useV5Session } from './store'
import type { V5Node } from './model'
import { useState } from 'react'

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
  return (
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-label={node.name ?? node.kind}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8 + depth * 12,
          background: selected ? '#dbeafe' : 'transparent',
        }}
      >
        {editing ? (
          <input
            aria-label="Layer name"
            value={name}
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
            onClick={() => session.selectNode(node.id)}
            onDoubleClick={() => node.role === 'group' && session.enterGroup(node.id)}
            style={{ flex: 1, textAlign: 'left' }}
          >
            {node.name ?? node.kind}
          </button>
        )}
        <button
          type="button"
          aria-label={
            node.visibility === 'shown'
              ? `Hide ${node.name ?? node.kind}`
              : `Show ${node.name ?? node.kind}`
          }
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
          aria-label={
            node.locked ? `Unlock ${node.name ?? node.kind}` : `Lock ${node.name ?? node.kind}`
          }
          onClick={() => session.execute(setNodeLocked(node.id, !node.locked))}
        >
          {node.locked ? '🔒' : '🔓'}
        </button>
        <button
          type="button"
          aria-label={`Rename ${node.name ?? node.kind}`}
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
        <button
          type="button"
          aria-label={`Send ${node.name ?? node.kind} backward`}
          disabled={index === 0}
          onClick={() => session.execute(reorderNode(node.id, index - 1))}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label={`Bring ${node.name ?? node.kind} forward`}
          disabled={index === siblings.length - 1}
          onClick={() => session.execute(reorderNode(node.id, index + 1))}
        >
          ↑
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
  return (
    <nav aria-label="Layers" data-v5-layers>
      <button type="button" onClick={() => session.exitGroup()} disabled={!session.editScopeId}>
        Exit group
      </button>
      {session.document.root.pages.map((page) => (
        <section key={page.id}>
          <h2 style={{ fontSize: 12, padding: '8px' }}>{page.id}</h2>
          <ul role="tree">
            {[...page.children].reverse().map((node) => (
              <Layer key={node.id} node={node} siblings={page.children} />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Group,
  Image,
  Lock,
  MoreHorizontal,
  Shapes,
  Table2,
  Type,
  Unlock,
} from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

type DropPosition = 'before' | 'inside' | 'after' | null

function Layer({
  node,
  siblings,
  parentId,
  depth = 0,
}: {
  node: V5Node
  siblings: V5Node[]
  parentId: string | null
  depth?: number
}) {
  const session = useV5Session()
  const selected = session.selectedNodeIds.includes(node.id)
  const index = siblings.indexOf(node)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(node.name ?? node.kind)
  const [expanded, setExpanded] = useState(true)
  const [dropPosition, setDropPosition] = useState<DropPosition>(null)
  const [dropError, setDropError] = useState<string | null>(null)
  const locked = isEffectivelyLocked(session.document, node.id)
  const inheritedLock = locked && !node.locked
  const hidden = isEffectivelyHidden(session.document, node.id)
  const label = node.name ?? node.kind

  const select = (additive = false) => {
    if (parentId && session.editScopeId !== parentId) session.enterGroup(parentId)
    else if (!parentId && session.editScopeId) session.exitAllGroups()
    session.selectNode(node.id, additive)
  }
  const commitName = () => {
    if (name.trim() && name !== label) session.execute(renameNode(node.id, name))
    else setName(label)
    setEditing(false)
  }
  const toggleVisibility = () => {
    const next = node.visibility === 'shown' ? 'hidden' : 'shown'
    session.execute(setNodeVisibility(node.id, next))
    if (next === 'hidden' && selected) session.selectNode(null)
  }
  const onTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tree = event.currentTarget.closest('[role="tree"]')
    const items = tree
      ? [...tree.querySelectorAll<HTMLElement>('[role="treeitem"] > [data-layer-row]')]
      : []
    const current = items.indexOf(event.currentTarget)
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Home' ||
      event.key === 'End'
    ) {
      event.preventDefault()
      const target =
        event.key === 'Home'
          ? items[0]
          : event.key === 'End'
            ? items.at(-1)
            : event.key === 'ArrowDown'
              ? items[Math.min(items.length - 1, current + 1)]
              : items[Math.max(0, current - 1)]
      target?.focus()
    } else if (event.key === 'ArrowRight' && node.children?.length) {
      event.preventDefault()
      setExpanded(true)
    } else if (event.key === 'ArrowLeft' && node.children?.length) {
      event.preventDefault()
      setExpanded(false)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(event.shiftKey)
    } else if (event.key === 'F2') {
      event.preventDefault()
      setEditing(true)
    }
  }

  return (
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={node.children?.length ? expanded : undefined}
      className="relative"
      draggable={!editing}
      onDragStart={(event) => {
        setDropError(null)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/v5-node-id', node.id)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        const relative = (event.clientY - rect.top) / Math.max(rect.height, 1)
        setDropPosition(
          node.role === 'group' && relative > 0.28 && relative < 0.72
            ? 'inside'
            : relative < 0.5
              ? 'before'
              : 'after',
        )
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropPosition(null)
      }}
      onDrop={(event) => {
        event.preventDefault()
        const source = event.dataTransfer.getData('text/v5-node-id')
        try {
          if (!source || source === node.id) return
          if (dropPosition === 'inside' && node.role === 'group') {
            session.execute(reparentNode(source, node.id))
            session.enterGroup(node.id)
            session.selectNode(source)
          } else if (siblings.some((candidate) => candidate.id === source)) {
            const sourceIndex = siblings.findIndex((candidate) => candidate.id === source)
            let target = dropPosition === 'before' ? index + 1 : index
            if (sourceIndex < target) target -= 1
            session.execute(reorderNode(source, target))
            session.selectNode(source)
          } else {
            const target = dropPosition === 'before' ? index + 1 : index
            session.execute(reparentNode(source, parentId, target))
            if (parentId) session.enterGroup(parentId)
            else session.exitAllGroups()
            session.selectNode(source)
          }
        } catch (error) {
          setDropError(error instanceof Error ? error.message : 'This layer cannot be moved there.')
        } finally {
          setDropPosition(null)
        }
      }}
    >
      {dropPosition === 'before' && (
        <span
          aria-hidden
          className="absolute -top-px left-2 right-2 z-10 h-0.5 rounded bg-primary"
        />
      )}
      {dropError && (
        <span
          role="alert"
          className="block rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
        >
          {dropError}
        </span>
      )}
      <div
        data-layer-row
        tabIndex={
          selected ||
          (!session.selectedNodeIds.length && depth === 0 && index === siblings.length - 1)
            ? 0
            : -1
        }
        onKeyDown={onTreeKeyDown}
        className={`group/row relative flex h-8 items-center gap-1 rounded-md pr-1 outline-none transition-colors duration-75 focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'} ${dropPosition === 'inside' ? 'ring-2 ring-primary/50' : ''}`}
        style={{ paddingLeft: 4 + depth * 15 }}
      >
        {node.children?.length ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            className="grid h-6 w-6 place-items-center rounded hover:bg-background"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-6" />
        )}
        <LayerIcon node={node} />
        {editing ? (
          <input
            aria-label="Layer name"
            value={name}
            className="min-w-0 flex-1 rounded border bg-background px-1 text-xs"
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitName()
              if (event.key === 'Escape') {
                setName(label)
                setEditing(false)
              }
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-xs"
            onClick={(event) => select(event.shiftKey)}
            onDoubleClick={() => {
              if (node.role === 'group') session.enterGroup(node.id)
              else setEditing(true)
            }}
          >
            {label}
          </button>
        )}
        {hidden && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="Hidden" />}
        {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Locked" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${label} actions`}
              className="grid h-7 w-7 place-items-center rounded opacity-0 hover:bg-background focus:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={toggleVisibility}>
              {node.visibility === 'shown' ? <EyeOff /> : <Eye />}
              {node.visibility === 'shown' ? 'Hide' : 'Show'}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={inheritedLock}
              onSelect={() => session.execute(setNodeLocked(node.id, !node.locked))}
            >
              {node.locked ? <Unlock /> : <Lock />}
              {inheritedLock ? 'Locked by parent' : node.locked ? 'Unlock' : 'Lock'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={index === siblings.length - 1 || locked}
              onSelect={() => session.execute(reorderNode(node.id, index + 1))}
            >
              Bring forward
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === 0 || locked}
              onSelect={() => session.execute(reorderNode(node.id, index - 1))}
            >
              Send backward
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={locked}
              onSelect={() => session.execute(reorderExtreme(node.id, 'front'))}
            >
              Bring to front
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={locked}
              onSelect={() => session.execute(reorderExtreme(node.id, 'back'))}
            >
              Send to back
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded && node.children?.length ? (
        <ul role="group">
          {[...node.children].reverse().map((child) => (
            <Layer
              key={child.id}
              node={child}
              siblings={node.children!}
              parentId={node.id}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function LayersPanel() {
  const session = useV5Session()
  const [rootDrop, setRootDrop] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const activePage = session.document.root.pages.find((page) => page.id === session.activePageId)
  return (
    <nav aria-label="Layers" data-v5-layers className="p-2">
      {session.editScopeId && (
        <button
          type="button"
          className="mb-2 rounded-full border px-2 py-1 text-xs hover:bg-accent"
          onClick={() => session.exitGroup()}
        >
          Exit group scope
        </button>
      )}
      <ul
        role="tree"
        aria-label="Layers of active page"
        className={`min-h-8 py-1 ${rootDrop ? 'rounded-md ring-2 ring-primary/50' : ''}`}
        onDragOver={(event) => {
          if (event.target !== event.currentTarget) return
          event.preventDefault()
          setRootDrop(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setRootDrop(false)
        }}
        onDrop={(event) => {
          if (event.target !== event.currentTarget) return
          event.preventDefault()
          const source = event.dataTransfer.getData('text/v5-node-id')
          try {
            if (source) {
              session.execute(reparentNode(source, null))
              session.exitAllGroups()
              session.selectNode(source)
              setDropError(null)
            }
          } catch (error) {
            setDropError(
              error instanceof Error ? error.message : 'This layer cannot move to the page root.',
            )
          } finally {
            setRootDrop(false)
          }
        }}
      >
        {activePage
          ? [...activePage.children]
              .reverse()
              .map((node) => (
                <Layer key={node.id} node={node} siblings={activePage.children} parentId={null} />
              ))
          : null}
      </ul>
      {dropError && (
        <p role="alert" className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
          {dropError}
        </p>
      )}
      {!activePage?.children.length && (
        <p className="p-3 text-center text-xs text-muted-foreground">This page has no objects.</p>
      )}
    </nav>
  )
}

function LayerIcon({ node }: { node: V5Node }) {
  const className = 'h-4 w-4 shrink-0 text-muted-foreground'
  if (node.role === 'group') return <Group className={className} aria-hidden />
  if (node.kind === 'text') return <Type className={className} aria-hidden />
  if (node.kind === 'image') return <Image className={className} aria-hidden />
  if (node.kind === 'table' || node.role === 'flow-frame')
    return <Table2 className={className} aria-hidden />
  return <Shapes className={className} aria-hidden />
}

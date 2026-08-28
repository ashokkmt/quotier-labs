import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useBuilderStore } from '../document/store'

function TreeNode({ id, depth = 0 }: { id: string; depth?: number }) {
  const node = useBuilderStore((state) => state.nodes[id])
  const selected = useBuilderStore((state) => state.selectedNodeId === id)
  const select = useBuilderStore((state) => state.selectNode)
  const [open, setOpen] = useState(true)
  if (!node) return null
  const canExpand = node.children.length > 0
  return (
    <li>
      <button
        type="button"
        className={`w-full flex items-center gap-1 rounded px-1 py-1 text-left text-xs ${selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => select(id)}
      >
        {canExpand ? (
          <span
            onClick={(event) => {
              event.stopPropagation()
              setOpen(!open)
            }}
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <span className="truncate">{node.role === 'root' ? 'Quotation body' : node.type}</span>
      </button>
      {open && canExpand && (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child} id={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
export function Navigator() {
  const rootId = useBuilderStore((state) => state.rootId)
  return (
    <nav className="border-t mt-4 pt-3" aria-label="Document structure">
      <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Structure
      </h2>
      <ul>
        <TreeNode id={rootId} />
      </ul>
    </nav>
  )
}

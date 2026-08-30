import { Copy, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useV5Session } from './store'
import { addPage, deletePage, duplicatePage, reorderPage } from './commands'
import { flattenNodes, isEffectivelyHidden } from './selectors'
import type { V5Page } from './model'

/** Authored-page navigation is owned here; the canvas never renders a selected-page frame. */
export function PagesPanel() {
  const session = useV5Session()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const pages = session.document.root.pages

  const navigate = (pageId: string, source: HTMLElement) => {
    session.setActivePage(pageId)
    requestAnimationFrame(() => {
      const engine = source.closest('[data-v5-engine]')
      const page = engine?.querySelector(`[data-v5-page-id="${pageId}"]`)
      page?.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
    })
  }

  return (
    <div className="p-3" data-v5-pages>
      <ul aria-label="Document pages" className="space-y-3">
        {pages.map((page, index) => {
          const active = page.id === session.activePageId
          return (
            <li
              key={page.id}
              draggable
              onDragStart={(event) => {
                setDragging(page.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/x-quotier-page', page.id)
              }}
              onDragEnd={() => {
                setDragging(null)
                setDropIndex(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDropIndex(index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const pageId = event.dataTransfer.getData('text/x-quotier-page') || dragging
                if (pageId) session.execute(reorderPage(pageId, index))
                setDragging(null)
                setDropIndex(null)
              }}
              className={`relative rounded-lg p-2 transition-colors duration-100 ${active ? 'bg-accent' : 'hover:bg-accent/60'}`}
            >
              {dropIndex === index && dragging !== page.id && (
                <span
                  aria-hidden
                  className="absolute -top-1 left-2 right-2 h-0.5 rounded bg-primary"
                />
              )}
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`Open page ${index + 1}`}
                  className="relative w-[108px] shrink-0 overflow-hidden border bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ aspectRatio: `${page.width} / ${page.height}` }}
                  onClick={(event) => navigate(page.id, event.currentTarget)}
                >
                  <PageMiniature page={page} document={session.document} />
                  {active && (
                    <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Page ${index + 1} actions`}
                      className="grid h-8 w-8 place-items-center rounded-md opacity-60 hover:bg-background hover:opacity-100 focus:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={index === 0}
                      onSelect={() => session.execute(reorderPage(page.id, index - 1))}
                    >
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === pages.length - 1}
                      onSelect={() => session.execute(reorderPage(page.id, index + 1))}
                    >
                      Move down
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        session.execute(
                          duplicatePage(page.id, session.nextID('page'), (prefix) =>
                            session.nextID(prefix),
                          ),
                        )
                      }
                    >
                      <Copy />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={pages.length <= 1}
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setConfirmDelete(page.id)}
                    >
                      <Trash2 />
                      Delete page
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="mt-1 text-xs font-medium">Page {index + 1}</p>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border text-sm hover:bg-accent"
        onClick={() =>
          session.execute(addPage(session.nextID('page'), session.document.settings.orientation))
        }
      >
        <Plus className="h-4 w-4" />
        Add page
      </button>
      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete page?</DialogTitle>
            <DialogDescription>
              This removes the page and its authored content. You can undo it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="h-9 rounded-md border px-3 text-sm hover:bg-accent"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              className="h-9 rounded-md bg-destructive px-3 text-sm text-destructive-foreground"
              onClick={() => {
                if (confirmDelete) session.execute(deletePage(confirmDelete))
                setConfirmDelete(null)
              }}
            >
              Delete page
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PageMiniature({
  page,
  document,
}: {
  page: V5Page
  document: ReturnType<typeof useV5Session>['document']
}) {
  return (
    <span className="absolute inset-0" aria-hidden>
      {flattenNodes(page.children)
        .filter((node) => !isEffectivelyHidden(document, node.id))
        .slice(0, 80)
        .map((node) => (
          <span
            key={node.id}
            className={`absolute block ${node.kind === 'image' ? 'bg-slate-300' : node.kind === 'shape' ? 'border border-slate-300' : 'bg-slate-400/70'}`}
            style={{
              left: `${(node.geometry.x / page.width) * 100}%`,
              top: `${(node.geometry.y / page.height) * 100}%`,
              width: `${Math.max(1, (node.geometry.width / page.width) * 100)}%`,
              height: `${Math.max(0.5, (node.geometry.height / page.height) * 100)}%`,
            }}
          />
        ))}
    </span>
  )
}

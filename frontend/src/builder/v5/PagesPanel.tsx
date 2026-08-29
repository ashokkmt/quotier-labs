import { useState } from 'react'
import { useV5Session } from './store'
import { addPage, deletePage, duplicatePage, reorderPage } from './commands'

/** Page rail: authored pages are managed here, never as canvas objects (tools.md §16). */
export function PagesPanel() {
  const session = useV5Session()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const pages = session.document.root.pages

  return (
    <div className="border-t p-2" data-v5-pages>
      <p className="pb-1 text-xs font-semibold uppercase text-muted-foreground">Pages</p>
      <ul className="space-y-1">
        {pages.map((page, index) => {
          const active = page.id === session.activePageId
          return (
            <li key={page.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => session.setActivePage(page.id)}
                className={`flex-1 rounded px-2 py-1 text-left text-sm hover:bg-accent ${
                  active ? 'bg-accent font-medium' : ''
                }`}
              >
                Page {index + 1}
              </button>
              <button
                type="button"
                aria-label={`Move page ${index + 1} up`}
                disabled={index === 0}
                className="px-1 text-xs disabled:opacity-30"
                onClick={() => session.execute(reorderPage(page.id, index - 1))}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move page ${index + 1} down`}
                disabled={index === pages.length - 1}
                className="px-1 text-xs disabled:opacity-30"
                onClick={() => session.execute(reorderPage(page.id, index + 1))}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Duplicate page ${index + 1}`}
                className="px-1 text-xs"
                onClick={() =>
                  session.execute(
                    duplicatePage(page.id, session.nextID('page'), (prefix) =>
                      session.nextID(prefix),
                    ),
                  )
                }
              >
                ⧉
              </button>
              <button
                type="button"
                aria-label={`Delete page ${index + 1}`}
                disabled={pages.length <= 1}
                className="px-1 text-xs disabled:opacity-30"
                onClick={() => setConfirmDelete(page.id)}
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className="mt-2 w-full rounded border px-2 py-1 text-sm hover:bg-accent"
        onClick={() =>
          session.execute(addPage(session.nextID('page'), session.document.settings.orientation))
        }
      >
        Add page
      </button>
      {confirmDelete && (
        <div
          role="alertdialog"
          aria-label="Confirm page delete"
          className="fixed inset-0 z-30 grid place-items-center bg-black/30"
        >
          <div className="rounded-lg bg-background p-4 shadow-lg">
            <p className="mb-3 text-sm">Delete this page and its content? This can be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1 text-sm"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                className="rounded bg-red-600 px-3 py-1 text-sm text-white"
                onClick={() => {
                  try {
                    session.execute(deletePage(confirmDelete))
                  } catch {
                    /* last page cannot be deleted */
                  }
                  setConfirmDelete(null)
                }}
              >
                Delete page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

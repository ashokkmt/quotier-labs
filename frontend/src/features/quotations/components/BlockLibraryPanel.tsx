import { useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { listWidgets } from '../../../builder/registry/registry'
import { useBuilderStore } from '../../../builder/document/store'

export function BlockLibraryPanel() {
  const widgets = listWidgets()
  const setDrag = useBuilderStore((state) => state.setDrag)
  const beginDrag = useCallback(
    (e: ReactPointerEvent | PointerEvent, widgetType: string) => {
      if (e.button !== 0) return
      e.preventDefault()
      setDrag({
        source: { type: 'create', widget: widgetType },
        x: (e as any).clientX,
        y: (e as any).clientY,
        startX: (e as any).clientX,
        startY: (e as any).clientY,
        active: false,
        resolution: null,
      })
    },
    [setDrag],
  )

  // Group widgets by category
  const categories = {
    field: widgets.filter((w) => w.category === 'field'),
    media: widgets.filter(
      (w) => w.category === 'content' && ['image', 'signature', 'stamp'].includes(w.type),
    ),
    structure: widgets.filter(
      (w) => w.category === 'structure' || ['divider', 'spacer'].includes(w.type),
    ),
    quotation: widgets.filter((w) => w.category === 'builtin-section' || w.type === 'table'),
  }

  return (
    <aside className="pr-3 overflow-y-auto" aria-label="Widget library">
      <h2 className="font-semibold mb-4 text-sm px-2">Widgets</h2>
      {Object.entries(categories).map(([category, items]) => {
        if (!items.length) return null
        return (
          <section key={category} className="mb-5 px-2">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              {category}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {items.map((widget) => (
                <Button
                  key={widget.type}
                  type="button"
                  variant="outline"
                  className="h-20 flex-col gap-1 px-1 text-xs hover:border-primary hover:bg-primary/5 cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => beginDrag(e, widget.type)}
                >
                  <FileText className="h-5 w-5" aria-hidden="true" />
                  <span className="text-center line-clamp-2">{widget.metadata.label}</span>
                </Button>
              ))}
            </div>
          </section>
        )
      })}
    </aside>
  )
}

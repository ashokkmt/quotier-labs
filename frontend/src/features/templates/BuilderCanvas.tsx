import type { Layout } from './schemas/layout-schema'
import { Button } from '@/components/ui/button'
import { Trash, Plus, GripHorizontal, Maximize2, SplitSquareHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ListSectionDefinitions } from '../../../wailsjs/go/wails/SectionHandler'

export function BuilderCanvas({
  layout,
  onChange,
}: {
  layout: Layout
  onChange: (l: Layout) => void
}) {
  const [sections, setSections] = useState<any[]>([])
  useEffect(() => {
    ListSectionDefinitions()
      .then(setSections)
      .catch(() => setSections([]))
  }, [])

  const removeRow = (rIndex: number) => {
    const newRows = [...layout.rows]
    newRows.splice(rIndex, 1)
    onChange({ rows: newRows })
  }

  const addSection = (rIndex: number, cIndex: number) => {
    const definition = sections[0]
    if (!definition) return
    const next = structuredClone(layout)
    next.rows[rIndex].columns[cIndex].sections.push({
      id: crypto.randomUUID(),
      section_definition_id: definition.id,
      visibility: true,
      optional: false,
    })
    onChange(next)
  }

  const splitColumn = (rIndex: number) => {
    const newRows = [...layout.rows]
    const row = newRows[rIndex]
    if (row.columns.length === 1) {
      row.columns[0].width = '50%'
      row.columns.push({
        id: crypto.randomUUID(),
        order: 1,
        width: '50%',
        sections: [],
      })
      onChange({ rows: newRows })
    }
  }

  const removeColumn = (rIndex: number, cIndex: number) => {
    const newRows = [...layout.rows]
    const row = newRows[rIndex]
    row.columns.splice(cIndex, 1)
    if (row.columns.length === 1) {
      row.columns[0].width = '100%'
    }
    onChange({ rows: newRows })
  }

  if (layout.rows.length === 0) {
    return (
      <div className="border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground bg-background">
        Empty Canvas. Click "Add Row" to start designing.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {layout.rows.map((row, rIndex) => (
        <div
          key={row.id}
          className="relative group border rounded-lg bg-background shadow-sm hover:border-primary/50 transition-colors"
        >
          <div className="absolute -left-3 -top-3 hidden group-hover:flex items-center gap-1">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md cursor-grab shadow-sm">
              <GripHorizontal className="w-4 h-4" />
            </div>
            <Button
              size="icon"
              variant="destructive"
              className="h-7 w-7 rounded-md"
              onClick={() => removeRow(rIndex)}
            >
              <Trash className="w-3 h-3" />
            </Button>
          </div>

          <div className="p-4 flex flex-wrap md:flex-nowrap gap-4">
            {row.columns.map((col, cIndex) => (
              <div
                key={col.id}
                className="min-h-[100px] border border-dashed border-border/60 rounded-md p-3 relative flex flex-col transition-all group/col hover:border-primary/30 hover:bg-primary/5"
                style={{
                  width:
                    col.width === '100%'
                      ? '100%'
                      : col.width === '50%'
                        ? 'calc(50% - 0.5rem)'
                        : col.width === '33%'
                          ? 'calc(33.33% - 0.66rem)'
                          : 'calc(66.66% - 0.33rem)',
                }}
              >
                <div className="absolute top-2 right-2 hidden group-hover/col:flex gap-1">
                  {row.columns.length === 1 && (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-6 w-6"
                      onClick={() => splitColumn(rIndex)}
                    >
                      <SplitSquareHorizontal className="w-3 h-3" />
                    </Button>
                  )}
                  {row.columns.length > 1 && (
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-6 w-6"
                      onClick={() => removeColumn(rIndex, cIndex)}
                    >
                      <Trash className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                <div className="flex-1">
                  {col.sections.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground opacity-50">
                      Empty Column
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {col.sections.map((sec) => (
                        <div
                          key={sec.id}
                          className="bg-card border rounded p-2 text-sm shadow-sm flex justify-between items-center"
                        >
                          <span>{sec.title_override || 'Section'}</span>
                          <Maximize2 className="w-3 h-3 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-dashed flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={sections.length === 0}
                    onClick={() => addSection(rIndex, cIndex)}
                    className="h-6 text-xs text-muted-foreground hover:text-primary w-full"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Section
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

import { Plus, Trash, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

export function TableEditor({
  fields,
  onChange,
  readOnly = false,
}: {
  fields: any[]
  onChange: (fields: any[]) => void
  readOnly?: boolean
}) {
  const addTable = () => {
    const newTable = {
      element_type: 'Table',
      table: {
        id: 'table_' + Date.now(),
        name: 'New Table',
        columns: [],
        has_totals: false,
      },
    }
    onChange([...fields, newTable])
  }

  const removeTable = (index: number) => {
    onChange(fields.filter((_, i) => i !== index))
  }

  const updateTable = (index: number, key: string, value: any) => {
    const newFields = [...fields]
    newFields[index].table[key] = value
    onChange(newFields)
  }

  const addColumn = (tableIndex: number) => {
    const newFields = [...fields]
    newFields[tableIndex].table.columns.push({
      id: 'col_' + Date.now(),
      label: 'New Column',
      type: 'Text',
    })
    onChange(newFields)
  }

  const updateColumn = (tableIndex: number, colIndex: number, key: string, value: any) => {
    const newFields = [...fields]
    newFields[tableIndex].table.columns[colIndex][key] = value
    onChange(newFields)
  }

  const removeColumn = (tableIndex: number, colIndex: number) => {
    const newFields = [...fields]
    newFields[tableIndex].table.columns = newFields[tableIndex].table.columns.filter(
      (_: any, i: number) => i !== colIndex,
    )
    onChange(newFields)
  }

  const fieldTypes = ['Text', 'Number', 'Currency', 'Computed']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Tables</h3>
        <Button type="button" variant="outline" size="sm" onClick={addTable} disabled={readOnly}>
          <Plus className="w-4 h-4 mr-2" /> Add Table
        </Button>
      </div>

      <div className="space-y-4">
        {fields.map(
          (f, i) =>
            f.element_type === 'Table' && (
              <div key={f.table.id} className="border rounded-md bg-card overflow-hidden">
                <div className="flex flex-col gap-3 border-b bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="Table ID"
                      value={f.table.id}
                      onChange={(e) => updateTable(i, 'id', e.target.value)}
                      disabled={readOnly}
                    />
                    <Input
                      placeholder="Table Name"
                      value={f.table.name}
                      onChange={(e) => updateTable(i, 'name', e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`totals-${f.table.id}`}
                        checked={f.table.has_totals}
                        onCheckedChange={(c) => updateTable(i, 'has_totals', !!c)}
                        disabled={readOnly}
                      />
                      <label htmlFor={`totals-${f.table.id}`} className="text-xs">
                        Show Totals
                      </label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTable(i)}
                      disabled={readOnly}
                    >
                      <Trash className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                      Columns
                    </h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addColumn(i)}
                      disabled={readOnly}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add Column
                    </Button>
                  </div>

                  {f.table.columns.map((col: any, cIdx: number) => (
                    <div
                      key={col.id}
                      className="group flex flex-col gap-3 rounded-sm border p-2 sm:flex-row sm:items-center"
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab opacity-50 group-hover:opacity-100" />
                      <div className="grid w-full flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Input
                          placeholder="Column ID"
                          value={col.id}
                          onChange={(e) => updateColumn(i, cIdx, 'id', e.target.value)}
                          disabled={readOnly}
                        />
                        <Input
                          placeholder="Label"
                          value={col.label}
                          onChange={(e) => updateColumn(i, cIdx, 'label', e.target.value)}
                          disabled={readOnly}
                        />
                        <Select
                          value={col.type}
                          onValueChange={(val) => updateColumn(i, cIdx, 'type', val)}
                          disabled={readOnly}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {fieldTypes.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center justify-between">
                          {col.type === 'Computed' ? (
                            <Input
                              placeholder="Formula"
                              value={col.formula || ''}
                              onChange={(e) => updateColumn(i, cIdx, 'formula', e.target.value)}
                              disabled={readOnly}
                            />
                          ) : (
                            <div />
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeColumn(i, cIdx)}
                            disabled={readOnly}
                          >
                            <Trash className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {f.table.columns.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-2">
                      No columns.
                    </div>
                  )}
                </div>
              </div>
            ),
        )}
        {fields.filter((f) => f.element_type === 'Table').length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
            No tables added yet.
          </div>
        )}
      </div>
    </div>
  )
}

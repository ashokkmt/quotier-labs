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

export function FieldEditor({
  fields,
  onChange,
  readOnly = false,
}: {
  fields: any[]
  onChange: (fields: any[]) => void
  readOnly?: boolean
}) {
  const addField = () => {
    const newField = {
      element_type: 'Field',
      field: {
        id: 'field_' + Date.now(),
        label: 'New Field',
        type: 'Text',
        required: false,
      },
    }
    onChange([...fields, newField])
  }

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index))
  }

  const updateField = (index: number, key: string, value: any) => {
    const newFields = [...fields]
    newFields[index].field[key] = value
    onChange(newFields)
  }

  const fieldTypes = [
    'Text',
    'Textarea',
    'Number',
    'Currency',
    'Date',
    'Select',
    'Boolean',
    'Image',
    'Computed',
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Fields</h3>
        <Button type="button" variant="outline" size="sm" onClick={addField} disabled={readOnly}>
          <Plus className="w-4 h-4 mr-2" /> Add Field
        </Button>
      </div>

      <div className="space-y-2">
        {fields.map(
          (f, i) =>
            f.element_type === 'Field' && (
              <div
                key={f.field.id}
                className="group flex flex-col gap-3 rounded-md border bg-card p-3 sm:flex-row sm:items-center"
              >
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab opacity-50 group-hover:opacity-100" />
                <div className="grid w-full flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Input
                    placeholder="Field ID"
                    value={f.field.id}
                    onChange={(e) => updateField(i, 'id', e.target.value)}
                    disabled={readOnly}
                  />
                  <Input
                    placeholder="Label"
                    value={f.field.label}
                    onChange={(e) => updateField(i, 'label', e.target.value)}
                    disabled={readOnly}
                  />
                  <Select
                    value={f.field.type}
                    onValueChange={(val) => updateField(i, 'type', val)}
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
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`req-${f.field.id}`}
                        checked={f.field.required}
                        onCheckedChange={(c) => updateField(i, 'required', !!c)}
                        disabled={readOnly}
                      />
                      <label htmlFor={`req-${f.field.id}`} className="text-xs">
                        Required
                      </label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeField(i)}
                      disabled={readOnly}
                    >
                      <Trash className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ),
        )}
        {fields.filter((f) => f.element_type === 'Field').length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
            No fields added yet.
          </div>
        )}
      </div>
    </div>
  )
}

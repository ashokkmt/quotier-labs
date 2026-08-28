import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FieldEditor } from './FieldEditor'
import { TableEditor } from './TableEditor'

export function SectionForm({ initialData, onSubmit, onCancel, isBuiltin }: any) {
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [category, setCategory] = useState(initialData?.category || '')

  const [schemaElements, setSchemaElements] = useState(() => {
    if (initialData?.schema) {
      try {
        const parsed = JSON.parse(initialData.schema)
        return parsed.elements || []
      } catch {
        return []
      }
    }
    return []
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name,
      description,
      category,
      schema: JSON.stringify({ elements: schemaElements }),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-sm font-medium mb-1 block">Section Name</label>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isBuiltin}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-sm font-medium mb-1 block">Category</label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isBuiltin}
          />
        </div>
        <div className="col-span-2">
          <label className="text-sm font-medium mb-1 block">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isBuiltin}
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium mb-4">Schema Definition</h3>
        <div className="space-y-8">
          <FieldEditor
            fields={schemaElements}
            onChange={isBuiltin ? () => {} : setSchemaElements}
            readOnly={isBuiltin}
          />
          <TableEditor
            fields={schemaElements}
            onChange={isBuiltin ? () => {} : setSchemaElements}
            readOnly={isBuiltin}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          {isBuiltin ? 'Close' : 'Cancel'}
        </Button>
        {!isBuiltin && <Button type="submit">Save Section</Button>}
      </div>
    </form>
  )
}

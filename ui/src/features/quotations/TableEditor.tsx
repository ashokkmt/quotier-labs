import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function TableEditor({ tableDef, rows, onChange, readOnly }: any) {
  const updateData = (rowIndex: number, columnId: string, value: any) => {
    const newRows = [...rows]
    if (!newRows[rowIndex]) newRows[rowIndex] = {}
    newRows[rowIndex][columnId] = value
    onChange(newRows)
  }

  const columns: ColumnDef<any, any>[] = [
    ...tableDef.columns.map((c: any) => ({
      accessorKey: c.id,
      header: c.label,
      cell: ({ row, getValue }: any) => {
        const val = getValue() as string
        if (readOnly) return <span>{val}</span>
        return (
          <Input
            value={val || ''}
            onChange={(e) => updateData(row.index, c.id, e.target.value)}
            className="h-8 min-w-[80px]"
          />
        )
      },
    })),
    ...(readOnly
      ? []
      : [
          {
            id: 'actions',
            cell: ({ row }: any) => (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => {
                  const newRows = [...rows]
                  newRows.splice(row.index, 1)
                  onChange(newRows)
                }}
              >
                <Trash className="w-3 h-3" />
              </Button>
            ),
          },
        ]),
  ]

  const table = useReactTable({
    data: rows || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            {table.getHeaderGroups().map((hg: any) => (
              <tr key={hg.id}>
                {hg.headers.map((h: any) => (
                  <th key={h.id} className="p-2 text-left font-medium">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-4 text-center text-muted-foreground">
                  No rows added
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row: any) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                  {row.getVisibleCells().map((cell: any) => (
                    <td key={cell.id} className="p-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onChange([...(rows || []), {}])
          }}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Row
        </Button>
      )}
    </div>
  )
}

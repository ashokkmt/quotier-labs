import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  GripHorizontal,
  GripVertical,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { V6_EMPTY_ROW_MIN_HEIGHT, clampV6RowMinHeight } from './model'
import {
  moveTableColumn,
  moveTableRow,
  selectTableColumn,
  selectTableRow,
  resizeTableColumnBoundary,
  resizeTableRowBoundary,
  tableTargetAt,
  type TableTarget,
} from './tableCommands'

type Geometry = {
  target: TableTarget
  table: HTMLElement
  row: HTMLTableRowElement
  cell: HTMLTableCellElement
  tableLeft: number
  tableTop: number
  tableWidth: number
  tableHeight: number
  rowTop: number
  rowHeight: number
  cellLeft: number
  cellWidth: number
  cellBottom: number
}

export function TableControls({
  editor,
  surfaceRef,
  zoom = 1,
}: {
  editor: Editor
  surfaceRef: RefObject<HTMLDivElement | null>
  zoom?: number
}) {
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const geometryRef = useRef<Geometry | null>(null)
  const [hovered, setHovered] = useState(false)
  const [heightLabel, setHeightLabel] = useState('')

  const measure = useCallback(
    (cell?: HTMLTableCellElement | null) => {
      const surface = surfaceRef.current
      if (!surface) return
      let target = cell
        ? tableTargetAt(editor, editor.view.posAtDOM(cell, 0))
        : tableTargetAt(editor)
      if (!target && cell) target = tableTargetAt(editor, editor.view.posAtDOM(cell, 0) + 1)
      if (!target) {
        geometryRef.current = null
        setGeometry(null)
        return
      }
      const node = editor.view.nodeDOM(target.cellPos)
      const cellElement =
        cell ??
        (node instanceof HTMLTableCellElement
          ? node
          : node instanceof HTMLElement
            ? node.closest<HTMLTableCellElement>('td,th')
            : null)
      const row = cellElement?.closest<HTMLTableRowElement>('tr')
      const table = cellElement?.closest<HTMLElement>('table')
      if (!cellElement || !row || !table) return
      const root = surface.getBoundingClientRect()
      const tableRect = table.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      const cellRect = cellElement.getBoundingClientRect()
      const next = {
        target,
        table,
        row,
        cell: cellElement,
        tableLeft: (tableRect.left - root.left) / zoom,
        tableTop: (tableRect.top - root.top) / zoom,
        tableWidth: tableRect.width / zoom,
        tableHeight: tableRect.height / zoom,
        rowTop: (rowRect.top - root.top) / zoom,
        rowHeight: rowRect.height / zoom,
        cellLeft: (cellRect.left - root.left) / zoom,
        cellWidth: cellRect.width / zoom,
        cellBottom: (cellRect.bottom - root.top) / zoom,
      }
      geometryRef.current = next
      setGeometry(next)
    },
    [editor, surfaceRef, zoom],
  )

  useEffect(() => {
    const root = editor.view.dom
    const selectionChanged = () => {
      if (hovered && geometryRef.current) measure(geometryRef.current.cell)
    }
    const mouseMove = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest('td,th') : null
      if (element instanceof HTMLTableCellElement && root.contains(element)) {
        setHovered(true)
        measure(element)
      } else if (!(
        event.target instanceof Element && event.target.closest('[data-v6-table-controls]')
      )) {
        setHovered(false)
        geometryRef.current = null
        setGeometry(null)
      }
    }
    const mouseLeave = (event: MouseEvent) => {
      const controls = surfaceRef.current?.querySelector('[data-v6-table-controls]')
      if (event.relatedTarget instanceof Node && controls?.contains(event.relatedTarget)) return
      setHovered(false)
      geometryRef.current = null
      setGeometry(null)
    }
    const reposition = () => {
      if (geometryRef.current) measure(geometryRef.current.cell)
    }
    root.addEventListener('mousemove', mouseMove)
    root.addEventListener('mouseleave', mouseLeave)
    editor.on('selectionUpdate', selectionChanged)
    editor.on('transaction', selectionChanged)
    window.addEventListener('resize', reposition)
    const scroller = surfaceRef.current?.closest('.v6-editor-scroller')
    scroller?.addEventListener('scroll', reposition)
    selectionChanged()
    return () => {
      root.removeEventListener('mousemove', mouseMove)
      root.removeEventListener('mouseleave', mouseLeave)
      editor.off('selectionUpdate', selectionChanged)
      editor.off('transaction', selectionChanged)
      window.removeEventListener('resize', reposition)
      scroller?.removeEventListener('scroll', reposition)
    }
  }, [editor, hovered, measure, surfaceRef])

  if (!geometry || !hovered) return null
  const { target } = geometry
  const selectRow = () => selectTableRow(editor, target)
  const selectColumn = () => selectTableColumn(editor, target)
  const rowAction = (action: () => void) => {
    selectRow()
    action()
  }
  const columnAction = (action: () => void) => {
    selectColumn()
    action()
  }
  const setAxisCellAttribute = (axis: 'row' | 'column', name: string, value: unknown) => {
    if (axis === 'row') selectRow()
    else selectColumn()
    editor.chain().focus().setCellAttribute(name, value).run()
  }
  const startRowResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startY = event.clientY
    const boundary = target.row + 1
    const nextRow = geometry.row.nextElementSibling as HTMLTableRowElement | null
    const startHeight = Math.max(
      Number(geometry.row.dataset.v6MinHeight || 0),
      Math.round((geometry.row.getBoundingClientRect().height / zoom) * 75),
    )
    const contentFloor = rowContentHeight(geometry.row)
    const nextFloor = nextRow ? rowContentHeight(nextRow) : V6_EMPTY_ROW_MIN_HEIGHT
    let proposed = Math.max(startHeight, contentFloor)
    let moved = false
    const move = (pointer: PointerEvent) => {
      moved = true
      proposed = clampV6RowMinHeight(
        Math.max(contentFloor, startHeight + ((pointer.clientY - startY) / zoom) * 75),
      )
      geometry.row.style.height = `${proposed / 75}px`
      setHeightLabel(`${(proposed / 283.465).toFixed(1)} mm`)
      measure(geometry.cell)
    }
    const finish = () => {
      cleanup()
      geometry.row.style.height = ''
      setHeightLabel('')
      if (moved) {
        const minimums = Array.from({ length: target.rows }, () => V6_EMPTY_ROW_MIN_HEIGHT)
        minimums[target.row] = contentFloor
        if (target.row + 1 < target.rows) minimums[target.row + 1] = nextFloor
        resizeTableRowBoundary(editor, target, boundary, proposed - startHeight, minimums)
      }
      editor.view.focus()
    }
    const cancel = () => {
      cleanup()
      geometry.row.style.height = ''
      setHeightLabel('')
      measure(geometry.cell)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', cancel, { once: true })
  }
  const startColumnResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const boundary = target.column + 1
    const startX = event.clientX
    const startWidth = geometry.cellWidth * 75
    let delta = 0
    const move = (pointer: PointerEvent) => {
      delta = ((pointer.clientX - startX) / zoom) * 75
      const preview = boundary === target.columns ? startWidth + delta : startWidth + delta
      geometry.cell.style.width = `${Math.max(48, preview / 75)}px`
      measure(geometry.cell)
    }
    const finish = () => {
      cleanup()
      geometry.cell.style.width = ''
      if (delta) resizeTableColumnBoundary(editor, target, boundary, delta)
      editor.view.focus()
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
  }
  const resizeByKeyboard = (direction: -1 | 1) => {
    const floor = rowContentHeight(geometry.row)
    const minimums = Array.from({ length: target.rows }, () => V6_EMPTY_ROW_MIN_HEIGHT)
    minimums[target.row] = floor
    resizeTableRowBoundary(editor, target, target.row + 1, direction * 300, minimums)
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-v6-table-controls
      aria-label="Table controls"
    >
      <div
        className="pointer-events-auto absolute"
        style={{ left: geometry.cellLeft, top: geometry.tableTop - 30, width: geometry.cellWidth }}
      >
        <AxisMenu
          axis="column"
          index={target.column}
          first={target.column === 0}
          last={target.column === target.columns - 1}
          onSelect={selectColumn}
          onInsertBefore={() => columnAction(() => editor.chain().focus().addColumnBefore().run())}
          onInsertAfter={() => columnAction(() => editor.chain().focus().addColumnAfter().run())}
          onDelete={() => columnAction(() => editor.chain().focus().deleteColumn().run())}
          onMoveBefore={() => moveTableColumn(editor, target, -1)}
          onMoveAfter={() => moveTableColumn(editor, target, 1)}
          onBackground={(value) => setAxisCellAttribute('column', 'background', value)}
          onAlignment={(value) => setAxisCellAttribute('column', 'alignment', value)}
          onBorder={(edge, value) => {
            for (const name of edge === 'all' ? ['top', 'right', 'bottom', 'left'] : [edge])
              setAxisCellAttribute('column', `border_${name}`, value)
          }}
        />
      </div>
      <div
        className="pointer-events-auto absolute flex items-center"
        style={{ left: geometry.tableLeft - 30, top: geometry.rowTop, height: geometry.rowHeight }}
      >
        <AxisMenu
          axis="row"
          index={target.row}
          first={target.row === 0}
          last={target.row === target.rows - 1}
          onSelect={selectRow}
          onInsertBefore={() => rowAction(() => editor.chain().focus().addRowBefore().run())}
          onInsertAfter={() => rowAction(() => editor.chain().focus().addRowAfter().run())}
          onDelete={() => rowAction(() => editor.chain().focus().deleteRow().run())}
          onMoveBefore={() => moveTableRow(editor, target, -1)}
          onMoveAfter={() => moveTableRow(editor, target, 1)}
          onBackground={(value) => setAxisCellAttribute('row', 'background', value)}
          onAlignment={(value) => setAxisCellAttribute('row', 'alignment', value)}
          onBorder={(edge, value) => {
            for (const name of edge === 'all' ? ['top', 'right', 'bottom', 'left'] : [edge])
              setAxisCellAttribute('row', `border_${name}`, value)
          }}
        />
      </div>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="pointer-events-auto absolute h-7 w-7 rounded-full shadow-md transition-transform duration-150 hover:scale-105 motion-reduce:transition-none"
        style={{
          left: geometry.tableLeft + geometry.tableWidth + 6,
          top: geometry.tableTop + geometry.tableHeight / 2 - 14,
        }}
        aria-label="Insert column after table"
        onClick={() => {
          selectTableColumn(editor, { ...target, column: target.columns - 1 })
          editor.chain().focus().addColumnAfter().run()
        }}
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="pointer-events-auto absolute h-7 w-7 rounded-full shadow-md transition-transform duration-150 hover:scale-105 motion-reduce:transition-none"
        style={{
          left: geometry.tableLeft + geometry.tableWidth / 2 - 14,
          top: geometry.tableTop + geometry.tableHeight + 6,
        }}
        aria-label="Insert row below table"
        onClick={() => {
          selectTableRow(editor, { ...target, row: target.rows - 1 })
          editor.chain().focus().addRowAfter().run()
        }}
      >
        <Plus className="h-4 w-4" />
      </Button>
      <button
        type="button"
        className="pointer-events-auto absolute h-3 cursor-ns-resize rounded border-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          left: geometry.tableLeft,
          top: geometry.rowTop + geometry.rowHeight - 5,
          width: geometry.tableWidth,
        }}
        role="slider"
        aria-label={`Resize row ${target.row + 1}`}
        aria-valuemin={V6_EMPTY_ROW_MIN_HEIGHT / 283.465}
        aria-valuemax={297}
        aria-valuenow={
          Math.max(V6_EMPTY_ROW_MIN_HEIGHT, Number(geometry.row.dataset.v6MinHeight || 0)) / 283.465
        }
        aria-valuetext={
          heightLabel ||
          `${(Math.max(V6_EMPTY_ROW_MIN_HEIGHT, Number(geometry.row.dataset.v6MinHeight || 0)) / 283.465).toFixed(1)} mm minimum`
        }
        onPointerDown={startRowResize}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            resizeByKeyboard(event.key === 'ArrowUp' ? -1 : 1)
          }
        }}
      >
        <span className="mx-auto block h-1 w-12 rounded-full bg-primary/70 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100" />
      </button>
      <button
        type="button"
        className="pointer-events-auto absolute w-3 cursor-ew-resize rounded border-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ left: geometry.cellLeft + geometry.cellWidth - 5, top: geometry.tableTop, height: geometry.tableHeight }}
        aria-label={`Resize ${target.column === target.columns - 1 ? 'table width' : `columns ${target.column + 1} and ${target.column + 2}`}`}
        onPointerDown={startColumnResize}
      />
      {heightLabel && (
        <span
          className="absolute rounded bg-foreground px-2 py-1 text-xs text-background shadow"
          style={{
            left: geometry.tableLeft + geometry.tableWidth / 2 - 28,
            top: geometry.rowTop + geometry.rowHeight + 8,
          }}
        >
          {heightLabel}
        </span>
      )}
    </div>
  )
}

function AxisMenu({
  axis,
  index,
  first,
  last,
  onSelect,
  onInsertBefore,
  onInsertAfter,
  onDelete,
  onMoveBefore,
  onMoveAfter,
  onBackground,
  onAlignment,
  onBorder,
}: {
  axis: 'row' | 'column'
  index: number
  first: boolean
  last: boolean
  onSelect: () => void
  onInsertBefore: () => void
  onInsertAfter: () => void
  onDelete: () => void
  onMoveBefore: () => void
  onMoveAfter: () => void
  onBackground: (value: string) => void
  onAlignment: (value: string) => void
  onBorder: (edge: 'all' | 'top' | 'right' | 'bottom' | 'left', value: unknown) => void
}) {
  const label = `${axis === 'row' ? 'Row' : 'Column'} ${index + 1} options`
  return (
    <DropdownMenu onOpenChange={(open) => open && onSelect()}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={`h-7 w-7 rounded-full border shadow-sm transition-colors duration-150 motion-reduce:transition-none ${axis === 'column' ? 'mx-auto flex' : ''}`}
          aria-label={label}
        >
          {axis === 'column' ? (
            <GripHorizontal className="h-4 w-4" />
          ) : (
            <GripVertical className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={axis === 'column' ? 'center' : 'start'}
        side={axis === 'column' ? 'bottom' : 'right'}
      >
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuItem disabled={first} onSelect={onMoveBefore}>
          Move {axis} {axis === 'row' ? 'up' : 'left'}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={last} onSelect={onMoveAfter}>
          Move {axis} {axis === 'row' ? 'down' : 'right'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onInsertBefore}>
          Insert {axis} {axis === 'row' ? 'above' : 'left'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onInsertAfter}>
          Insert {axis} {axis === 'row' ? 'below' : 'right'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSelect}>Select {axis}</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Background</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => onBackground('transparent')}>
              Transparent
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onBackground('#F3F4F6')}>Light gray</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onBackground('#FEF3C7')}>
              Light yellow
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onBackground('#DBEAFE')}>Light blue</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Borders</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {(['all', 'top', 'right', 'bottom', 'left'] as const).map((edge) => (
              <DropdownMenuSub key={edge}>
                <DropdownMenuSubTrigger className="capitalize">{edge}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => onBorder(edge, { color: '#111827', width: 100, style: 'solid' })}>Thin solid</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onBorder(edge, { color: '#2563EB', width: 100, style: 'dashed' })}>Blue dashed</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onBorder(edge, { color: '#6B7280', width: 100, style: 'dotted' })}>Gray dotted</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onBorder(edge, { color: '#111827', width: 150, style: 'double' })}>Double</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onBorder(edge, null)}>Clear</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Alignment</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => onAlignment('left')}>
              <AlignLeft /> Left
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAlignment('center')}>
              <AlignCenter /> Center
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAlignment('right')}>
              <AlignRight /> Right
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
          Delete {axis}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function rowContentHeight(row: HTMLTableRowElement) {
  let pixels = 0
  for (const cell of Array.from(row.cells)) {
    const children = Array.from(cell.children) as HTMLElement[]
    const first = children[0]?.getBoundingClientRect()
    const last = children.at(-1)?.getBoundingClientRect()
    const style = getComputedStyle(cell)
    const padding =
      (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
    const content = first && last ? last.bottom - first.top : 0
    pixels = Math.max(pixels, content + padding)
  }
  return Math.max(V6_EMPTY_ROW_MIN_HEIGHT, Math.ceil(pixels * 75))
}

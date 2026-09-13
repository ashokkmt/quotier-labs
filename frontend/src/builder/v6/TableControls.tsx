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
import { AppSelect } from '@/components/ui/select'
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
import { ControlledColorPicker } from '../v5/ColorPicker'
import { colorValueToCSS } from '../v5/tokens'
import {
  V6_EMPTY_ROW_MIN_HEIGHT,
  clampV6RowMinHeight,
  usedColorsForV6,
  type V6Document,
} from './model'
import {
  moveTableColumn,
  moveTableRow,
  selectTableColumn,
  selectTableRow,
  selectWholeTable,
  setTableRowMinHeight,
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
  document,
  surfaceRef,
}: {
  editor: Editor
  document: V6Document
  surfaceRef: RefObject<HTMLDivElement | null>
}) {
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const geometryRef = useRef<Geometry | null>(null)
  const [selected, setSelected] = useState(false)
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
        tableLeft: tableRect.left - root.left,
        tableTop: tableRect.top - root.top,
        tableWidth: tableRect.width,
        tableHeight: tableRect.height,
        rowTop: rowRect.top - root.top,
        rowHeight: rowRect.height,
        cellLeft: cellRect.left - root.left,
        cellWidth: cellRect.width,
        cellBottom: cellRect.bottom - root.top,
      }
      geometryRef.current = next
      setGeometry(next)
    },
    [editor, surfaceRef],
  )

  useEffect(() => {
    const root = editor.view.dom
    const selectionChanged = () => {
      const target = tableTargetAt(editor)
      setSelected(Boolean(target))
      if (target) measure()
    }
    const mouseMove = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest('td,th') : null
      if (element instanceof HTMLTableCellElement && root.contains(element)) measure(element)
    }
    const mouseLeave = (event: MouseEvent) => {
      const controls = surfaceRef.current?.querySelector('[data-v6-table-controls]')
      if (event.relatedTarget instanceof Node && controls?.contains(event.relatedTarget)) return
      if (!tableTargetAt(editor)) {
        geometryRef.current = null
        setGeometry(null)
      }
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
  }, [editor, measure, surfaceRef])

  if (!geometry) return null
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
  const setAxisCellAttribute = (axis: 'row' | 'column', name: string, value: string) => {
    if (axis === 'row') selectRow()
    else selectColumn()
    editor.chain().focus().setCellAttribute(name, value).run()
  }
  const startRowResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startY = event.clientY
    const startHeight = Math.max(
      Number(geometry.row.dataset.v6MinHeight || 0),
      Math.round(geometry.row.getBoundingClientRect().height * 75),
    )
    const contentFloor = rowContentHeight(geometry.row)
    let proposed = Math.max(startHeight, contentFloor)
    let moved = false
    const move = (pointer: PointerEvent) => {
      moved = true
      proposed = clampV6RowMinHeight(
        Math.max(contentFloor, startHeight + (pointer.clientY - startY) * 75),
      )
      geometry.row.style.height = `${proposed / 75}px`
      setHeightLabel(`${(proposed / 283.465).toFixed(1)} mm`)
      measure(geometry.cell)
    }
    const finish = () => {
      cleanup()
      geometry.row.style.height = ''
      setHeightLabel('')
      if (moved) setTableRowMinHeight(editor, target, proposed)
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
  const resizeByKeyboard = (direction: -1 | 1) => {
    const floor = rowContentHeight(geometry.row)
    const current = Math.max(
      Number(geometry.row.dataset.v6MinHeight || 0),
      Math.round(geometry.row.getBoundingClientRect().height * 75),
    )
    setTableRowMinHeight(editor, target, Math.max(floor, current + direction * 300))
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
      {selected && (
        <CellToolbar
          editor={editor}
          document={document}
          left={geometry.cellLeft}
          top={geometry.cellBottom + 6}
        />
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

function CellToolbar({
  editor,
  document,
  left,
  top,
}: {
  editor: Editor
  document: V6Document
  left: number
  top: number
}) {
  const button = (label: string, mark: string) => (
    <Button
      type="button"
      size="icon"
      variant={editor.isActive(mark) ? 'secondary' : 'ghost'}
      className="h-7 w-7"
      aria-label={label}
      aria-pressed={editor.isActive(mark)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.chain().focus().toggleMark(mark).run()}
    >
      {label[0]}
    </Button>
  )
  const target = tableTargetAt(editor)
  const tableAttrs = editor.getAttributes('table')
  return (
    <div
      className="pointer-events-auto absolute flex items-center gap-1 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left, top }}
      role="toolbar"
      aria-label="Cell formatting"
    >
      {button('Bold', 'bold')}
      {button('Italic', 'italic')}
      {button('Underline', 'underline')}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={!editor.can().mergeCells()}
        onClick={() => editor.chain().focus().mergeCells().run()}
      >
        Merge
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={!editor.can().splitCell()}
        onClick={() => editor.chain().focus().splitCell().run()}
      >
        Split
      </Button>
      <ControlledColorPicker
        compact
        label="Text color"
        value={editor.getAttributes('textStyle').color || '#111827'}
        usedColors={usedColorsForV6(document)}
        allowTransparent={false}
        onChange={(value) =>
          editor
            .chain()
            .focus()
            .setMark('textStyle', {
              ...editor.getAttributes('textStyle'),
              color: colorValueToCSS(value),
            })
            .run()
        }
      />
      <ControlledColorPicker
        compact
        label="Cell background"
        value={editor.getAttributes('tableCell').background || 'transparent'}
        usedColors={usedColorsForV6(document)}
        onChange={(value) =>
          editor
            .chain()
            .focus()
            .setCellAttribute(
              'background',
              value === 'transparent' ? value : colorValueToCSS(value),
            )
            .run()
        }
      />
      <AppSelect
        label="Cell alignment"
        className="h-7 w-24 px-2 text-xs"
        value={editor.getAttributes('tableCell').alignment || 'left'}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ]}
        onValueChange={(value) => editor.chain().focus().setCellAttribute('alignment', value).run()}
      />
      <AppSelect
        label="Cell vertical alignment"
        className="h-7 w-24 px-2 text-xs"
        value={
          editor.getAttributes('tableCell').vertical_alignment ||
          editor.getAttributes('tableHeader').vertical_alignment ||
          'top'
        }
        options={[
          { value: 'top', label: 'Top' },
          { value: 'middle', label: 'Middle' },
          { value: 'bottom', label: 'Bottom' },
        ]}
        onValueChange={(value) =>
          editor.chain().focus().setCellAttribute('vertical_alignment', value).run()
        }
      />
      <AppSelect
        label="Cell padding"
        className="h-7 w-24 px-2 text-xs"
        value={String(editor.getAttributes('tableCell').padding || 425)}
        options={[
          { value: '200', label: 'Compact' },
          { value: '425', label: 'Normal' },
          { value: '700', label: 'Roomy' },
        ]}
        onValueChange={(value) =>
          editor.chain().focus().setCellAttribute('padding', Number(value)).run()
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
            Table
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Table properties</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeaderRow().run()}>
            Toggle header row
          </DropdownMenuItem>
          {(['left', 'center', 'right'] as const).map((alignment) => (
            <DropdownMenuItem
              key={alignment}
              onSelect={() => editor.chain().focus().updateAttributes('table', { alignment }).run()}
            >
              Align table {alignment}
              {tableAttrs.alignment === alignment ? ' ✓' : ''}
            </DropdownMenuItem>
          ))}
          {(['all', 'outer', 'none'] as const).map((preset) => (
            <DropdownMenuItem
              key={preset}
              onSelect={() =>
                editor.chain().focus().updateAttributes('table', { border_preset: preset }).run()
              }
            >
              {preset === 'all'
                ? 'All borders'
                : preset === 'outer'
                  ? 'Outer border'
                  : 'No borders'}
              {tableAttrs.border_preset === preset ? ' ✓' : ''}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!target}
            onSelect={() => target && selectWholeTable(editor, target)}
          >
            Select table
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => editor.chain().focus().deleteTable().run()}
          >
            Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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

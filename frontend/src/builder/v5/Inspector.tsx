import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ChevronDown,
  Eye,
  EyeOff,
  Group,
  Image as ImageIcon,
  Lock,
  Unlock,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useV5Session } from './store'
import {
  alignNodes,
  alignToPage,
  distributeNodes,
  groupNodes,
  renameNode,
  setNodesLocked,
  setNodesVisibility,
  updateNodeGeometry,
  updateNodeProps,
  updateTableContent,
} from './commands'
import {
  V5_COLOR_TOKENS,
  V5_STROKE_STYLES,
  V5_TEXT_ALIGNS,
  V5_TEXT_VERTICAL_ALIGNS,
  V5_FONT_SIZE_MAX_PT,
  V5_FONT_SIZE_MIN_PT,
  clampFontSize,
  clampStrokeWidth,
  type V5ColorToken,
} from './tokens'
import { ancestorChain, findNode, isEffectivelyLocked } from './selectors'
import { getV5Widget } from './registry'
import { du, type V5Node } from './model'
import { readValidatedImage } from './imageAssets'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  normalizeTableData,
  TABLE_DEFAULT_ROW_HEIGHT_MM,
  TABLE_MIN_ROW_HEIGHT_MM,
  type V5TableData,
} from './table'

const field =
  'h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'
const MM_PER_POINT = 25.4 / 72
const toMM = (duValue: number) => (duValue / 100) * MM_PER_POINT
const fromMM = (value: number) => du((value / MM_PER_POINT) * 100)

function Section({
  title,
  children,
  open = true,
}: {
  title: string
  children: ReactNode
  open?: boolean
}) {
  return (
    <details open={open} className="group border-b py-2">
      <summary className="flex h-8 cursor-pointer list-none items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {title}
        <ChevronDown className="h-3.5 w-3.5 transition-transform duration-100 group-open:rotate-180" />
      </summary>
      <div className="space-y-2 pb-2 pt-1">{children}</div>
    </details>
  )
}

function BufferedText({
  value,
  label,
  disabled,
  onCommit,
  exact = false,
}: {
  value: string
  label: string
  disabled?: boolean
  onCommit: (value: string) => void
  exact?: boolean
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const next = exact ? draft : draft.trim()
    if ((exact || next) && next !== value) onCommit(next)
    else setDraft(value)
  }
  return (
    <input
      className={field}
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function BufferedNumber({
  value,
  label,
  disabled,
  min,
  max,
  auto,
  onCommit,
}: {
  value: number
  label: string
  disabled?: boolean
  min?: number
  max?: number
  auto?: boolean
  onCommit: (value: number) => void
}) {
  const formatted = Number(value.toFixed(2)).toString()
  const [draft, setDraft] = useState(formatted)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setDraft(formatted)
    setError(null)
  }, [formatted])
  const commit = () => {
    const parsed = Number(draft)
    if (
      !Number.isFinite(parsed) ||
      (min !== undefined && parsed < min) ||
      (max !== undefined && parsed > max)
    ) {
      setError(`Enter ${min ?? 'a valid value'}${max !== undefined ? `–${max}` : ' or greater'}.`)
      return
    }
    setError(null)
    if (parsed !== value) onCommit(parsed)
  }
  return (
    <label className="block min-w-0 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        className={`${field} mt-1 ${error ? 'border-destructive' : ''}`}
        aria-invalid={Boolean(error)}
        value={auto ? 'Auto' : draft}
        disabled={disabled || auto}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
            if (!error) event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(formatted)
            setError(null)
            event.currentTarget.blur()
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            const step = event.shiftKey ? 10 : 1
            const next = Number(draft || value) + (event.key === 'ArrowUp' ? step : -step)
            setDraft(String(next))
          }
        }}
      />
      {error && (
        <span role="alert" className="mt-1 block text-[11px] text-destructive">
          {error}
        </span>
      )}
    </label>
  )
}

export function Inspector() {
  const session = useV5Session()
  const selectedIds = session.selectedNodeIds
  const selected = selectedIds
    .map((id) =>
      findNode(
        session.document.root.pages.flatMap((page) => page.children),
        id,
      ),
    )
    .filter((node): node is V5Node => Boolean(node))

  if (!selected.length)
    return (
      <div aria-label="Properties" className="w-full p-4 text-sm text-muted-foreground">
        Select an object to inspect exact print properties.
      </div>
    )
  if (selected.length > 1) return <MultiInspector nodes={selected} />
  return <SingleInspector node={selected[0]} />
}

function SingleInspector({ node }: { node: V5Node }) {
  const session = useV5Session()
  const effectivelyLocked = isEffectivelyLocked(session.document, node.id)
  const inheritedLock = effectivelyLocked && !node.locked
  const capability = node.role === 'group' ? null : getV5Widget(node.kind)
  const tableStory = node.story_id
    ? session.document.stories?.find(
        (story) => story.id === node.story_id && story.kind === 'table',
      )
    : null
  const commitGeometry = (patch: Partial<V5Node['geometry']>) => {
    if (tableStory && patch.width) {
      const table = normalizeTableData(tableStory.content)
      const ratio = patch.width / node.geometry.width
      table.column_widths = table.column_widths.map((width) =>
        du((width || node.geometry.width / table.column_count) * ratio),
      )
      session.execute(updateTableContent(node.id, table, patch))
      return
    }
    session.execute(updateNodeGeometry(node.id, { ...node.geometry, ...patch }))
  }
  return (
    <div aria-label="Properties" className="w-full overflow-y-auto px-4 py-2">
      <div className="flex h-10 items-center justify-between border-b">
        <p className="text-sm font-medium">Properties</p>
        <span className="text-xs capitalize text-muted-foreground">
          {node.role === 'flow-frame' ? 'table frame' : node.kind}
        </span>
      </div>
      <Section title="Identity">
        <label className="block text-xs text-muted-foreground">
          Name
          <BufferedText
            value={node.name ?? node.kind}
            label="Object name"
            disabled={effectivelyLocked}
            onCommit={(value) => session.execute(renameNode(node.id, value))}
          />
        </label>
        {node.binding_kind && (
          <p className="text-xs text-muted-foreground">
            Binding <span className="float-right text-foreground">{node.binding_kind}</span>
          </p>
        )}
      </Section>
      <Section title="Geometry">
        <div className="grid grid-cols-2 gap-2">
          <BufferedNumber
            label="X (mm)"
            value={toMM(node.geometry.x)}
            min={0}
            disabled={effectivelyLocked}
            onCommit={(value) => commitGeometry({ x: fromMM(value) })}
          />
          <BufferedNumber
            label="Y (mm)"
            value={toMM(node.geometry.y)}
            min={0}
            disabled={effectivelyLocked}
            onCommit={(value) => commitGeometry({ y: fromMM(value) })}
          />
          <BufferedNumber
            label="W (mm)"
            value={toMM(node.geometry.width)}
            min={0.1}
            disabled={effectivelyLocked || capability?.canResizeX === false}
            onCommit={(value) => commitGeometry({ width: fromMM(value) })}
          />
          <BufferedNumber
            label="H (mm)"
            value={toMM(node.geometry.height)}
            min={0.1}
            auto={node.layout_mode === 'intrinsic' || Boolean(tableStory)}
            disabled={effectivelyLocked || capability?.canResizeY === false || Boolean(tableStory)}
            onCommit={(value) => commitGeometry({ height: fromMM(value) })}
          />
        </div>
        {(node.role === 'group' || capability?.canRotate) && (
          <BufferedNumber
            label="Rotation (°)"
            value={node.geometry.rotation / 100}
            min={-360}
            max={360}
            disabled={effectivelyLocked}
            onCommit={(value) => commitGeometry({ rotation: du(value * 100) })}
          />
        )}
      </Section>
      <ArrangeSection node={node} disabled={effectivelyLocked} />
      {node.kind === 'text' && <TextStyle node={node} disabled={effectivelyLocked} />}
      {node.kind === 'shape' && <ShapeStyle node={node} disabled={effectivelyLocked} />}
      {node.kind === 'image' && <ImageContent node={node} disabled={effectivelyLocked} />}
      {node.role === 'flow-frame' && node.story_id && (
        <TableContent node={node} disabled={effectivelyLocked} />
      )}
      <Section title="State">
        {inheritedLock && <p className="rounded bg-muted px-2 py-1 text-xs">Locked by parent</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={inheritedLock}
            className="flex h-8 items-center justify-center gap-1 rounded-md border text-xs hover:bg-accent"
            onClick={() => session.execute(setNodesLocked([node.id], !node.locked))}
          >
            {node.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {node.locked ? 'Unlock' : 'Lock'}
          </button>
          <button
            type="button"
            className="flex h-8 items-center justify-center gap-1 rounded-md border text-xs hover:bg-accent"
            onClick={() => {
              const next = node.visibility === 'shown' ? 'hidden' : 'shown'
              session.execute(setNodesVisibility([node.id], next))
              if (next === 'hidden') session.selectNode(null)
            }}
          >
            {node.visibility === 'shown' ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {node.visibility === 'shown' ? 'Hide' : 'Show'}
          </button>
        </div>
      </Section>
      {ancestorChain(session.document, node.id).length > 1 && (
        <p className="py-3 text-xs text-muted-foreground">
          Position is relative to its parent group; direct manipulation preserves page-space
          geometry.
        </p>
      )}
    </div>
  )
}

function ArrangeSection({ node, disabled }: { node: V5Node; disabled?: boolean }) {
  const session = useV5Session()
  const modes = [
    ['left', AlignStartVertical],
    ['center-x', AlignCenterVertical],
    ['right', AlignEndVertical],
    ['top', AlignStartHorizontal],
    ['center-y', AlignCenterHorizontal],
    ['bottom', AlignEndHorizontal],
  ] as const
  return (
    <Section title="Arrange" open={false}>
      <div className="grid grid-cols-6 gap-1">
        {modes.map(([mode, Icon]) => (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            aria-label={`Align ${mode} to printable page`}
            className="grid h-8 place-items-center rounded border hover:bg-accent disabled:opacity-40"
            onClick={() => session.execute(alignToPage(node.id, mode))}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </Section>
  )
}

function TextStyle({ node, disabled }: { node: V5Node; disabled?: boolean }) {
  const session = useV5Session()
  const props = node.props ?? {}
  const set = (patch: Record<string, unknown>) => session.execute(updateNodeProps(node.id, patch))
  return (
    <Section title="Text style">
      <p className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
        Edit words directly on the page with Enter or double-click.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <BufferedNumber
          label="Size (pt)"
          value={Number(props.fontSize ?? 11)}
          min={V5_FONT_SIZE_MIN_PT}
          max={V5_FONT_SIZE_MAX_PT}
          disabled={disabled}
          onCommit={(value) => set({ fontSize: clampFontSize(value) })}
        />
        <OptionSelect
          label="Horizontal"
          value={String(props.align ?? 'left')}
          options={[...V5_TEXT_ALIGNS]}
          disabled={disabled}
          onChange={(align) => set({ align })}
        />
        <OptionSelect
          label="Vertical"
          value={String(props.verticalAlign ?? 'top')}
          options={[...V5_TEXT_VERTICAL_ALIGNS]}
          disabled={disabled}
          onChange={(verticalAlign) => set({ verticalAlign })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs">
          <input
            type="checkbox"
            checked={Boolean(props.bold)}
            disabled={disabled}
            onChange={(event) => set({ bold: event.target.checked })}
          />
          Bold
        </label>
        <ColorSelect
          value={String(props.color ?? 'black')}
          onChange={(value) => set({ color: value as V5ColorToken })}
          disabled={disabled}
        />
      </div>
    </Section>
  )
}

function ShapeStyle({ node, disabled }: { node: V5Node; disabled?: boolean }) {
  const session = useV5Session()
  const props = node.props ?? {}
  const set = (patch: Record<string, unknown>) => session.execute(updateNodeProps(node.id, patch))
  return (
    <Section title="Style">
      <div className="grid grid-cols-2 gap-2">
        <ColorSelect
          label="Fill"
          allowNone
          value={String(props.fill ?? 'none')}
          onChange={(value) => set({ fill: value })}
          disabled={disabled}
        />
        <ColorSelect
          label="Stroke"
          allowNone
          value={String(props.stroke ?? 'none')}
          onChange={(value) => set({ stroke: value })}
          disabled={disabled}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <OptionSelect
          label="Line style"
          value={String(props.strokeStyle ?? 'solid')}
          options={[...V5_STROKE_STYLES]}
          disabled={disabled}
          onChange={(strokeStyle) => set({ strokeStyle })}
        />
        <BufferedNumber
          label="Width (pt)"
          value={Number(props.strokeWidth ?? 1)}
          min={0.25}
          max={12}
          disabled={disabled}
          onCommit={(value) => set({ strokeWidth: clampStrokeWidth(value) })}
        />
      </div>
    </Section>
  )
}

function ColorSelect({
  label = 'Color',
  value,
  allowNone,
  disabled,
  onChange,
}: {
  label?: string
  value: string
  allowNone?: boolean
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <OptionSelect
      label={label}
      value={value}
      options={[...(allowNone ? ['none'] : []), ...V5_COLOR_TOKENS]}
      disabled={disabled}
      onChange={onChange}
      color
    />
  )
}

function OptionSelect({
  label,
  value,
  options,
  disabled,
  onChange,
  color = false,
}: {
  label: string
  value: string
  options: string[]
  disabled?: boolean
  onChange: (value: string) => void
  color?: boolean
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <Select value={value} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-8 bg-background text-xs" data-v5-editor-chrome>
          <SelectValue />
        </SelectTrigger>
        <SelectContent data-v5-editor-chrome>
          {options.map((option) => (
            <SelectItem key={option} value={option} className="capitalize">
              <span className="flex items-center gap-2">
                {color && (
                  <span
                    aria-hidden
                    className="h-3 w-3 rounded-full border"
                    style={{
                      background:
                        option === 'none'
                          ? 'transparent'
                          : option === 'black'
                            ? '#111827'
                            : option === 'gray'
                              ? '#6b7280'
                              : option === 'white'
                                ? '#fff'
                                : option === 'primary'
                                  ? '#2563eb'
                                  : option === 'danger'
                                    ? '#dc2626'
                                    : '#16a34a',
                    }}
                  />
                )}
                {option}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

function ImageContent({ node, disabled }: { node: V5Node; disabled?: boolean }) {
  const session = useV5Session()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const choose = async (file?: File) => {
    if (!file) return
    try {
      const { source } = await readValidatedImage(file)
      session.execute(updateNodeProps(node.id, { source }))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image could not be read.')
    }
  }
  return (
    <Section title="Image">
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <button
        type="button"
        disabled={disabled}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-md border text-sm hover:bg-accent disabled:opacity-40"
        onClick={() => input.current?.click()}
      >
        <ImageIcon className="h-4 w-4" />
        {node.props?.source ? 'Replace image' : 'Choose image'}
      </button>
      <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP · maximum 5 MB</p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </Section>
  )
}

function TableContent({ node, disabled }: { node: V5Node; disabled?: boolean }) {
  const session = useV5Session()
  const story = session.document.stories?.find((candidate) => candidate.id === node.story_id)
  const source = normalizeTableData(story?.content)
  const [draft, setDraft] = useState<V5TableData>(() => structuredClone(source))
  useEffect(() => setDraft(normalizeTableData(story?.content)), [story?.content])
  if (!story) return null
  const commit = (next: V5TableData) => {
    const normalized = normalizeTableData(next)
    setDraft(normalized)
    session.execute(updateTableContent(node.id, normalized))
  }
  return (
    <Section title="Table content">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[240px] gap-1"
          style={{
            gridTemplateColumns: `repeat(${draft.column_count}, minmax(72px, 1fr))`,
          }}
        >
          {draft.headers.map((header, column) => (
            <BufferedText
              key={`h-${column}`}
              value={header}
              label={`Header ${column + 1}`}
              disabled={disabled}
              exact
              onCommit={(value) =>
                commit({
                  ...draft,
                  headers: draft.headers.map((item, index) => (index === column ? value : item)),
                })
              }
            />
          ))}
          {draft.rows.map((row, rowIndex) =>
            row.map((cell, column) => (
              <BufferedText
                key={`${rowIndex}-${column}`}
                value={cell}
                label={`Row ${rowIndex + 1}, column ${column + 1}`}
                disabled={disabled}
                exact
                onCommit={(value) =>
                  commit({
                    ...draft,
                    rows: draft.rows.map((item, index) =>
                      index === rowIndex
                        ? item.map((entry, cellIndex) => (cellIndex === column ? value : entry))
                        : item,
                    ),
                  })
                }
              />
            )),
          )}
        </div>
      </div>
      <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs">
        <input
          type="checkbox"
          checked={draft.header_enabled}
          disabled={disabled}
          onChange={(event) =>
            commit({
              ...draft,
              header_enabled: event.target.checked,
              repeat_header: event.target.checked && draft.repeat_header,
            })
          }
        />
        Header row
      </label>
      <BufferedNumber
        label="Uniform row height (mm)"
        value={draft.row_height_mm ?? TABLE_DEFAULT_ROW_HEIGHT_MM}
        min={TABLE_MIN_ROW_HEIGHT_MM}
        max={30}
        disabled={disabled}
        onCommit={(row_height_mm) => commit({ ...draft, row_height_mm })}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          className="h-8 flex-1 rounded-md border text-xs hover:bg-accent disabled:opacity-40"
          onClick={() => commit({ ...draft, rows: [...draft.rows, draft.headers.map(() => '')] })}
        >
          Add row
        </button>
        <button
          type="button"
          disabled={disabled || draft.rows.length <= 1}
          className="h-8 flex-1 rounded-md border text-xs hover:bg-accent disabled:opacity-40"
          onClick={() => commit({ ...draft, rows: draft.rows.slice(0, -1) })}
        >
          Remove row
        </button>
        <button
          type="button"
          disabled={disabled || draft.column_count >= 12}
          className="h-8 rounded-md border text-xs hover:bg-accent disabled:opacity-40"
          onClick={() => {
            const count = draft.column_count + 1
            const averageWidth = Math.round(
              draft.column_widths.reduce((sum, width) => sum + width, 0) / draft.column_count,
            )
            commit({
              ...draft,
              column_count: count,
              headers: [...draft.headers, ''],
              rows: draft.rows.map((row) => [...row, '']),
              column_widths: [...draft.column_widths, averageWidth],
            })
          }}
        >
          Add column
        </button>
        <button
          type="button"
          disabled={disabled || draft.column_count <= 1}
          className="h-8 rounded-md border text-xs hover:bg-accent disabled:opacity-40"
          onClick={() => {
            const count = draft.column_count - 1
            commit({
              ...draft,
              column_count: count,
              headers: draft.headers.slice(0, count),
              rows: draft.rows.map((row) => row.slice(0, count)),
              column_widths: draft.column_widths.slice(0, count),
            })
          }}
        >
          Remove column
        </button>
      </div>
    </Section>
  )
}

function MultiInspector({ nodes }: { nodes: V5Node[] }) {
  const session = useV5Session()
  const [error, setError] = useState<string | null>(null)
  const ids = nodes.map((node) => node.id)
  const allLocked = nodes.every((node) => node.locked)
  const allHidden = nodes.every((node) => node.visibility === 'hidden')
  const hasInheritedLock = nodes.some(
    (node) => isEffectivelyLocked(session.document, node.id) && !node.locked,
  )
  const run = (action: () => void) => {
    try {
      action()
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That action could not be completed.')
    }
  }
  const modes = [
    ['left', AlignStartVertical],
    ['center-x', AlignCenterVertical],
    ['right', AlignEndVertical],
    ['top', AlignStartHorizontal],
    ['center-y', AlignCenterHorizontal],
    ['bottom', AlignEndHorizontal],
  ] as const
  return (
    <div aria-label="Properties" className="w-full overflow-y-auto px-4 py-2">
      <div className="flex h-10 items-center justify-between border-b">
        <p className="text-sm font-medium">Properties</p>
        <span className="text-xs text-muted-foreground">{nodes.length} objects</span>
      </div>
      <Section title="Arrange">
        <div className="grid grid-cols-6 gap-1">
          {modes.map(([mode, Icon]) => (
            <button
              key={mode}
              type="button"
              aria-label={`Align ${mode}`}
              className="grid h-8 place-items-center rounded border hover:bg-accent"
              disabled={hasInheritedLock}
              onClick={() => run(() => session.execute(alignNodes(ids, mode)))}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="h-8 rounded border text-xs hover:bg-accent"
            disabled={hasInheritedLock}
            onClick={() => run(() => session.execute(distributeNodes(ids, 'x')))}
          >
            Distribute horizontally
          </button>
          <button
            type="button"
            className="h-8 rounded border text-xs hover:bg-accent"
            disabled={hasInheritedLock}
            onClick={() => run(() => session.execute(distributeNodes(ids, 'y')))}
          >
            Distribute vertically
          </button>
        </div>
        <button
          type="button"
          className="flex h-8 w-full items-center justify-center gap-2 rounded border text-xs hover:bg-accent"
          disabled={hasInheritedLock}
          onClick={() =>
            run(() => {
              const groupId = session.nextID('group')
              session.execute(groupNodes(session.activePageId, ids, groupId))
              session.selectNode(groupId)
            })
          }
        >
          <Group className="h-4 w-4" />
          Group selection
        </button>
      </Section>
      <Section title="State">
        <p className="text-xs text-muted-foreground">
          Mixed values are changed for the complete selection.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="flex h-8 items-center justify-center gap-1 rounded border text-xs hover:bg-accent"
            disabled={hasInheritedLock}
            onClick={() => run(() => session.execute(setNodesLocked(ids, !allLocked)))}
          >
            {allLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {allLocked ? 'Unlock all' : 'Lock all'}
          </button>
          <button
            type="button"
            className="flex h-8 items-center justify-center gap-1 rounded border text-xs hover:bg-accent"
            disabled={hasInheritedLock}
            onClick={() =>
              run(() => {
                session.execute(setNodesVisibility(ids, allHidden ? 'shown' : 'hidden'))
                if (!allHidden) session.selectNode(null)
              })
            }
          >
            {allHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {allHidden ? 'Show all' : 'Hide all'}
          </button>
        </div>
        {hasInheritedLock && (
          <p className="rounded bg-muted px-2 py-1 text-xs">
            Selection contains a parent-locked object.
          </p>
        )}
        {error && (
          <p
            role="alert"
            aria-live="polite"
            className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive"
          >
            {error}
          </p>
        )}
      </Section>
    </div>
  )
}

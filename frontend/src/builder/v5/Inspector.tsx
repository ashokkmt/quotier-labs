import { useV5Session } from './store'
import {
  alignNodes,
  distributeNodes,
  renameNode,
  setNodeLocked,
  setNodeVisibility,
  updateNodeGeometry,
  updateNodeProps,
} from './commands'
import {
  V5_COLOR_TOKENS,
  V5_STROKE_STYLES,
  V5_TEXT_ALIGNS,
  V5_FONT_SIZE_MAX_PT,
  V5_FONT_SIZE_MIN_PT,
  clampFontSize,
  clampStrokeWidth,
  type V5ColorToken,
} from './tokens'
import { du, type V5Node } from './model'

const toPt = (value: number) => value / 100
const toDu = (value: number) => du(value * 100)

const field =
  'w-full rounded border border-input bg-background px-2 py-1 text-sm disabled:opacity-50'
const row = 'flex items-center justify-between gap-2'

function ColorSelect({
  label,
  value,
  allowNone,
  onChange,
  disabled,
}: {
  label: string
  value: string
  allowNone?: boolean
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <label className={row}>
      <span className="text-sm">{label}</span>
      <select
        aria-label={label}
        className={field}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowNone && <option value="none">None</option>}
        {V5_COLOR_TOKENS.map((token) => (
          <option key={token} value={token}>
            {token}
          </option>
        ))}
      </select>
    </label>
  )
}

function GeometryFields({ node }: { node: V5Node }) {
  const session = useV5Session()
  const g = node.geometry
  const commit = (patch: Partial<typeof g>) =>
    session.execute(updateNodeGeometry(node.id, { ...g, ...patch }))
  const numberField = (label: string, value: number, onCommit: (v: number) => void) => (
    <label className={row}>
      <span className="text-sm">{label}</span>
      <input
        type="number"
        aria-label={label}
        className={`${field} w-20`}
        value={value}
        step={1}
        min={0}
        disabled={node.locked}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onCommit(next)
        }}
      />
    </label>
  )
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold uppercase text-muted-foreground">Position</legend>
      {numberField('X (pt)', toPt(g.x), (v) => commit({ x: toDu(v) }))}
      {numberField('Y (pt)', toPt(g.y), (v) => commit({ y: toDu(v) }))}
      {numberField('W (pt)', toPt(g.width), (v) => v > 0 && commit({ width: toDu(v) }))}
      {numberField('H (pt)', toPt(g.height), (v) => v > 0 && commit({ height: toDu(v) }))}
      {numberField('Rotation °', g.rotation / 100, (v) =>
        session.execute(updateNodeGeometry(node.id, { ...g, rotation: du(v * 100) })),
      )}
    </fieldset>
  )
}

function TextFields({ node }: { node: V5Node }) {
  const session = useV5Session()
  const props = (node.props ?? {}) as Record<string, unknown>
  const set = (patch: Record<string, unknown>) => session.execute(updateNodeProps(node.id, patch))
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold uppercase text-muted-foreground">Text</legend>
      <label className="block">
        <span className="text-sm">Content</span>
        <textarea
          aria-label="Text content"
          className={field}
          rows={3}
          value={String(props.text ?? '')}
          disabled={node.locked}
          onChange={(event) => set({ text: event.target.value })}
        />
      </label>
      <label className={row}>
        <span className="text-sm">Size (pt)</span>
        <input
          type="number"
          aria-label="Font size"
          className={`${field} w-20`}
          value={Number(props.fontSize ?? 11)}
          min={V5_FONT_SIZE_MIN_PT}
          max={V5_FONT_SIZE_MAX_PT}
          disabled={node.locked}
          onChange={(event) => set({ fontSize: clampFontSize(Number(event.target.value)) })}
        />
      </label>
      <label className={row}>
        <span className="text-sm">Bold</span>
        <input
          type="checkbox"
          aria-label="Bold"
          checked={Boolean(props.bold)}
          disabled={node.locked}
          onChange={(event) => set({ bold: event.target.checked })}
        />
      </label>
      <label className={row}>
        <span className="text-sm">Align</span>
        <select
          aria-label="Text alignment"
          className={field}
          value={String(props.align ?? 'left')}
          disabled={node.locked}
          onChange={(event) => set({ align: event.target.value })}
        >
          {V5_TEXT_ALIGNS.map((align) => (
            <option key={align} value={align}>
              {align}
            </option>
          ))}
        </select>
      </label>
      <ColorSelect
        label="Color"
        value={String(props.color ?? 'black')}
        disabled={node.locked}
        onChange={(value) => set({ color: value as V5ColorToken })}
      />
    </fieldset>
  )
}

function ShapeFields({ node }: { node: V5Node }) {
  const session = useV5Session()
  const props = (node.props ?? {}) as Record<string, unknown>
  const set = (patch: Record<string, unknown>) => session.execute(updateNodeProps(node.id, patch))
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold uppercase text-muted-foreground">Shape</legend>
      <p className="text-sm capitalize">{String(props.variant ?? 'rect')}</p>
      <ColorSelect
        label="Background"
        value={String(props.fill ?? 'none')}
        allowNone
        disabled={node.locked}
        onChange={(value) => set({ fill: value })}
      />
      <ColorSelect
        label="Border color"
        value={String(props.stroke ?? 'none')}
        allowNone
        disabled={node.locked}
        onChange={(value) => set({ stroke: value })}
      />
      <label className={row}>
        <span className="text-sm">Border style</span>
        <select
          aria-label="Border style"
          className={field}
          value={String(props.strokeStyle ?? 'solid')}
          disabled={node.locked}
          onChange={(event) => set({ strokeStyle: event.target.value })}
        >
          {V5_STROKE_STYLES.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>
      </label>
      <label className={row}>
        <span className="text-sm">Border width (pt)</span>
        <input
          type="number"
          aria-label="Border width"
          className={`${field} w-20`}
          value={Number(props.strokeWidth ?? 1)}
          step={0.25}
          min={0.25}
          max={12}
          disabled={node.locked}
          onChange={(event) => set({ strokeWidth: clampStrokeWidth(Number(event.target.value)) })}
        />
      </label>
    </fieldset>
  )
}

function ImageFields({ node }: { node: V5Node }) {
  const session = useV5Session()
  const props = (node.props ?? {}) as Record<string, unknown>
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold uppercase text-muted-foreground">Image</legend>
      <label className="block">
        <span className="text-sm">Source (PNG/JPEG data URI)</span>
        <textarea
          aria-label="Image source"
          className={field}
          rows={3}
          value={String(props.source ?? '')}
          disabled={node.locked}
          onChange={(event) =>
            session.execute(updateNodeProps(node.id, { source: event.target.value }))
          }
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Only inline PNG or JPEG data is allowed; SVG and file paths are rejected by the renderer.
      </p>
    </fieldset>
  )
}

export function Inspector() {
  const session = useV5Session()
  const selectedIds = session.selectedNodeIds
  const selectedId = selectedIds[0]
  const node = selectedId
    ? findNode(
        session.document.root.pages.flatMap((page) => page.children),
        selectedId,
      )
    : null
  if (!node)
    return (
      <aside aria-label="Properties" className="w-64 shrink-0 border-l bg-background p-3">
        <p className="text-sm text-muted-foreground">Select an element to edit its properties.</p>
      </aside>
    )
  const disabled = node.locked
  return (
    <aside
      aria-label="Properties"
      className="w-64 shrink-0 space-y-4 overflow-y-auto border-l bg-background p-3"
    >
      <label className="block">
        <span className="text-sm">Name</span>
        <input
          aria-label="Element name"
          className={field}
          value={node.name ?? ''}
          disabled={disabled}
          onChange={(event) => session.execute(renameNode(node.id, event.target.value))}
        />
      </label>
      <GeometryFields node={node} />
      {selectedIds.length > 1 && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold uppercase text-muted-foreground">Arrange</legend>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                ['left', '⇤'],
                ['center-x', '↔'],
                ['right', '⇥'],
                ['top', '⇡'],
                ['center-y', '↕'],
                ['bottom', '⇣'],
              ] as const
            ).map(([mode, glyph]) => (
              <button
                key={mode}
                type="button"
                aria-label={`Align ${mode.replace('-', ' ')}`}
                title={`Align ${mode.replace('-', ' ')}`}
                className="rounded border py-1 text-xs hover:bg-accent"
                onClick={() => session.execute(alignNodes(selectedIds, mode))}
              >
                {glyph}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              className="rounded border py-1 text-xs hover:bg-accent"
              onClick={() => session.execute(distributeNodes(selectedIds, 'x'))}
            >
              Distribute ↔
            </button>
            <button
              type="button"
              className="rounded border py-1 text-xs hover:bg-accent"
              onClick={() => session.execute(distributeNodes(selectedIds, 'y'))}
            >
              Distribute ↕
            </button>
          </div>
        </fieldset>
      )}
      {node.kind === 'text' && <TextFields node={node} />}
      {node.kind === 'shape' && <ShapeFields node={node} />}
      {node.kind === 'image' && <ImageFields node={node} />}
      <div className="space-y-1 border-t pt-2">
        <button
          type="button"
          className="w-full rounded border px-2 py-1 text-sm hover:bg-accent"
          onClick={() => session.execute(setNodeLocked(node.id, !node.locked))}
        >
          {node.locked ? 'Unlock' : 'Lock'}
        </button>
        <button
          type="button"
          className="w-full rounded border px-2 py-1 text-sm hover:bg-accent"
          onClick={() =>
            session.execute(
              setNodeVisibility(node.id, node.visibility === 'shown' ? 'hidden' : 'shown'),
            )
          }
        >
          {node.visibility === 'shown' ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tokens render identically in the PDF; freeform colors are not allowed.
      </p>
    </aside>
  )
}

function findNode(nodes: V5Node[], id: string): V5Node | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children ?? [], id)
    if (found) return found
  }
  return null
}

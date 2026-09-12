import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { clampV6Indent } from './model'

type Indents = {
  left_indent?: number
  first_line_indent?: number
  hanging_indent?: number
  right_indent?: number
}
type IndentName = keyof Indents
type DisplayIndents = { [K in IndentName]?: number | 'mixed' }

const controls: Array<[IndentName, string]> = [
  ['left_indent', 'Left indent'],
  ['first_line_indent', 'First-line indent'],
  ['hanging_indent', 'Hanging indent'],
  ['right_indent', 'Right indent'],
]

export function Ruler({
  values,
  onChange,
  compact = false,
}: {
  values: DisplayIndents
  onChange: (patch: Indents) => void
  compact?: boolean
}) {
  const [draft, setDraft] = useState<Indents>({})
  const dragging = useRef<IndentName | null>(null)
  const [draggingName, setDraggingName] = useState<IndentName | null>(null)

  const patchFor = (name: IndentName, value: number): Indents => {
    const patch: Indents = { [name]: clampV6Indent(value) }
    if (name === 'first_line_indent' && value > 0) patch.hanging_indent = 0
    if (name === 'left_indent') {
      const hanging = Number(values.hanging_indent === 'mixed' ? 0 : (values.hanging_indent ?? 0))
      if (clampV6Indent(value) < hanging) patch.hanging_indent = clampV6Indent(value)
    }
    if (name === 'hanging_indent' && value > 0) {
      patch.first_line_indent = 0
      const left = Number(values.left_indent === 'mixed' ? 0 : (values.left_indent ?? 0))
      if (value > left) patch.left_indent = clampV6Indent(value)
    }
    return patch
  }
  const updateDraft = (name: IndentName, value: number) =>
    setDraft((current) => ({ ...current, ...patchFor(name, value) }))
  const commit = (name: IndentName, value: number) => onChange(patchFor(name, value))

  return (
    <fieldset className={compact ? 'grid gap-2' : 'grid gap-2 border-b bg-muted/40 px-3 py-2'}>
      <legend className="sr-only">Paragraph ruler</legend>
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {controls.map(([name, label]) => {
          const mixed = values[name] === 'mixed' && draggingName !== name
          const value = clampV6Indent(
            Number((draggingName === name ? draft[name] : values[name]) ?? 0),
          )
          return (
            <div key={name} className="grid grid-cols-[1fr_5rem] items-center gap-2">
              <label className="grid gap-1 text-xs">
                {label}
                <input
                  aria-label={`${label} ruler handle`}
                  className="h-2 w-full cursor-ew-resize accent-primary"
                  type="range"
                  min={0}
                  max={14400}
                  step={100}
                  value={value}
                  aria-valuetext={mixed ? 'Mixed values' : undefined}
                  onPointerDown={() => {
                    dragging.current = name
                    setDraggingName(name)
                  }}
                  onInput={(event) => updateDraft(name, Number(event.currentTarget.value))}
                  onChange={(event) => {
                    if (!dragging.current) commit(name, Number(event.currentTarget.value))
                  }}
                  onPointerUp={(event) => {
                    dragging.current = null
                    setDraggingName(null)
                    commit(name, Number(event.currentTarget.value))
                  }}
                  onPointerCancel={() => {
                    dragging.current = null
                    setDraggingName(null)
                  }}
                />
              </label>
              <Input
                aria-label={`${label} in millimetres`}
                className="h-7"
                type="number"
                min={0}
                max={50.8}
                step={1}
                value={mixed ? '' : Math.round((value / 283.465) * 10) / 10}
                placeholder={mixed ? 'Mixed' : undefined}
                onChange={(event) => {
                  const next = Number(event.target.value) * 283.465
                  updateDraft(name, next)
                  commit(name, next)
                }}
              />
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

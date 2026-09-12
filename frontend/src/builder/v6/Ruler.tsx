import { Input } from '@/components/ui/input'

export function Ruler({
  values,
  onChange,
}: {
  values: { left_indent?: number; first_line_indent?: number; right_indent?: number }
  onChange: (name: string, value: number) => void
}) {
  const controls = [
    ['left_indent', 'Left indent'],
    ['first_line_indent', 'First-line indent'],
    ['right_indent', 'Right indent'],
  ] as const
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-3 py-2"
      aria-label="Paragraph ruler"
    >
      <div className="relative h-5 min-w-48 flex-1 rounded bg-background shadow-inner" aria-hidden>
        <div className="absolute inset-y-0 left-0 w-8 bg-muted" />
        <div className="absolute inset-y-0 right-0 w-8 bg-muted" />
        <span
          className="absolute top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-primary"
          style={{ left: `${Math.min(85, 12 + Number(values.first_line_indent ?? 0) / 500)}%` }}
        />
        <span
          className="absolute bottom-0 h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-primary"
          style={{ left: `${Math.min(85, 12 + Number(values.left_indent ?? 0) / 500)}%` }}
        />
        <span className="absolute bottom-0 right-[12%] h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-primary" />
      </div>
      {controls.map(([name, label]) => (
        <label key={name} className="flex items-center gap-1 text-xs">
          {label}
          <Input
            aria-label={`${label} in millimetres`}
            className="h-7 w-20"
            type="number"
            min={0}
            max={100}
            step={1}
            value={Math.round(Number(values[name] ?? 0) / 283.465)}
            onChange={(event) => onChange(name, Math.round(Number(event.target.value) * 283.465))}
          />
        </label>
      ))}
    </div>
  )
}

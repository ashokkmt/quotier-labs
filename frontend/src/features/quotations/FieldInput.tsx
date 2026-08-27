import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"

export function FieldInput({ field, value, onChange, readOnly }: any) {
  if (readOnly) {
    return <div className="text-sm py-2 px-3 bg-muted/30 rounded-md border border-transparent min-h-[40px]">{value?.toString() || "-"}</div>
  }

  switch (field.type) {
    case "Text":
      return <Input value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.label} />
    case "Textarea":
      return <Textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.label} />
    case "Number":
      return <Input type="number" value={value || ""} onChange={e => onChange(Number(e.target.value))} placeholder={field.label} />
    case "Currency":
      return <Input type="number" step="0.01" value={value || ""} onChange={e => onChange(Number(e.target.value))} placeholder={field.label} className="pl-6" /> // A hacky way for now, real currency input later
    case "Boolean":
      return (
        <div className="flex items-center gap-2 py-2">
          <Checkbox checked={!!value} onCheckedChange={(c) => onChange(!!c)} />
          <span className="text-sm">{field.label}</span>
        </div>
      )
    default:
      return <Input value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.label} />
  }
}

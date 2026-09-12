import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { boundedNumberValue } from './boundedNumber'

export function BoundedNumberInput({
  label,
  value,
  min,
  max,
  step,
  className,
  placeholder,
  onCommit,
}: {
  label: string
  value: number | ''
  min: number
  max: number
  step?: number
  className?: string
  placeholder?: string
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])
  const commit = () => {
    const bounded = boundedNumberValue(draft, min, max)
    if (bounded === null) {
      setDraft(String(value))
      return
    }
    setDraft(String(bounded))
    onCommit(bounded)
  }
  return (
    <Input
      aria-label={label}
      className={className}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      placeholder={placeholder}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false
        commit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(String(value))
          event.currentTarget.blur()
        }
      }}
    />
  )
}

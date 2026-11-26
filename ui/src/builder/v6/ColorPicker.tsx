import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Check, Pipette } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  COLOR_HEX,
  COLOR_TOKENS,
  colorValueToCSS,
  hexToHSV,
  hsvToHex,
  isColorToken,
  normalizeColorValue,
} from './color'

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

type Props = {
  label: string
  value: string
  disabled?: boolean
  allowTransparent?: boolean
  compact?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onDragStart?: () => void
  onDismissIntent?: () => void
  onChange: (value: string) => void
  usedColors?: string[]
}

export function ControlledColorPicker({
  label,
  value,
  disabled,
  allowTransparent = true,
  compact = false,
  open: controlledOpen,
  onOpenChange,
  onDragStart,
  onDismissIntent,
  onChange,
  usedColors = [],
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (next: boolean) => {
    setInternalOpen(next)
    onOpenChange?.(next)
  }
  const dragging = useRef(false)
  const ignoreDragClose = useRef(false)
  const css = colorValueToCSS(value)
  const visibleHex = css === 'transparent' ? 'Transparent' : css.toUpperCase()
  const current = hexToHSV(css === 'transparent' ? '#000000' : css)
  const [hueDraft, setHueDraft] = useState<number | null>(null)
  const hue = hueDraft ?? current.h
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const hex = hexDraft ?? (css === 'transparent' ? '#000000' : css.toUpperCase())

  const finishDragging = () => {
    dragging.current = false
    ignoreDragClose.current = true
  }
  const commitHex = () => {
    const normalized = normalizeColorValue(hex)
    if (normalized !== 'black' || /^#?0{6}$/i.test(hex)) onChange(normalized)
    setHexDraft(null)
    setHueDraft(null)
  }
  const updateSV = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onChange(
      hsvToHex({
        h: hue,
        s: clamp((event.clientX - rect.left) / rect.width),
        v: clamp(1 - (event.clientY - rect.top) / rect.height),
      }),
    )
  }
  const onPaletteKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02
    let { s, v } = current
    if (event.key === 'ArrowLeft') s -= step
    else if (event.key === 'ArrowRight') s += step
    else if (event.key === 'ArrowUp') v += step
    else if (event.key === 'ArrowDown') v -= step
    else return
    event.preventDefault()
    onChange(hsvToHex({ h: hue, s: clamp(s), v: clamp(v) }))
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next && (dragging.current || ignoreDragClose.current)) {
          ignoreDragClose.current = false
          return
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${visibleHex}`}
          data-v6-editor-chrome
          onPointerDown={() => {
            ignoreDragClose.current = false
            onDismissIntent?.()
          }}
          className={
            compact
              ? 'grid h-7 w-7 place-items-center rounded-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'
              : 'mt-1 flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'
          }
        >
          <ColorSwatch color={css} />
          {!compact && <span className="min-w-0 truncate">{visibleHex}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-v6-editor-chrome
        align="start"
        collisionPadding={12}
        className="w-72 space-y-3 rounded-xl p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={() => {
          ignoreDragClose.current = false
          onDismissIntent?.()
        }}
        onEscapeKeyDown={() => {
          ignoreDragClose.current = false
          onDismissIntent?.()
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{label}</p>
          <span className="font-mono text-[11px] text-muted-foreground">{visibleHex}</span>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${label} saturation and brightness`}
          aria-valuetext={`${Math.round(current.s * 100)}% saturation, ${Math.round(current.v * 100)}% brightness`}
          className="relative h-36 cursor-crosshair touch-none overflow-hidden rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`,
          }}
          onPointerDown={(event) => {
            dragging.current = true
            ignoreDragClose.current = false
            onDragStart?.()
            event.currentTarget.setPointerCapture(event.pointerId)
            updateSV(event)
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSV(event)
          }}
          onPointerUp={finishDragging}
          onPointerCancel={finishDragging}
          onKeyDown={onPaletteKey}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.65),0_1px_4px_rgba(0,0,0,.5)]"
            style={{ left: `${current.s * 100}%`, top: `${(1 - current.v) * 100}%` }}
          />
        </div>
        <input
          type="range"
          aria-label={`${label} hue`}
          min={0}
          max={359}
          value={Math.round(hue)}
          className="document-hue-slider h-3 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]"
          onChange={(event) => {
            const h = Number(event.target.value)
            setHueDraft(h)
            onChange(hsvToHex({ h, s: current.s, v: current.v }))
          }}
          onPointerDown={() => {
            dragging.current = true
            ignoreDragClose.current = false
            onDragStart?.()
          }}
          onPointerUp={() => {
            setHueDraft(null)
            finishDragging()
          }}
          onPointerCancel={finishDragging}
          onBlur={() => setHueDraft(null)}
        />
        <div className="flex h-10 items-center gap-2 rounded-lg border bg-background px-2">
          <ColorSwatch color={css} />
          <span className="text-muted-foreground">#</span>
          <input
            aria-label={`${label} hex value`}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase outline-none"
            value={hex.replace(/^#/, '')}
            maxLength={6}
            onChange={(event) => setHexDraft(`#${event.target.value.replace(/[^0-9a-f]/gi, '')}`)}
            onBlur={commitHex}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitHex()
              }
            }}
          />
          <Pipette className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        {usedColors.length > 0 && (
          <ColorChoices
            label="Used colors"
            colors={usedColors}
            current={visibleHex}
            onChange={onChange}
          />
        )}
        <section aria-label="Theme colors" className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Theme colors</p>
          <div className="grid grid-cols-8 gap-2">
            {COLOR_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                aria-label={`${label} ${token} ${COLOR_HEX[token]}`}
                title={token}
                className="relative h-7 w-7 rounded-md border shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ background: COLOR_HEX[token] }}
                onClick={() => onChange(token)}
              >
                {isColorToken(value) && value === token && (
                  <Check className={`absolute inset-1 h-5 w-5 ${token === 'white' ? 'text-black' : 'text-white'}`} />
                )}
              </button>
            ))}
            {allowTransparent && (
              <button
                type="button"
                aria-label="Transparent"
                title="Transparent"
                className="grid h-7 w-7 place-items-center rounded-md border"
                onClick={() => onChange('transparent')}
              >
                <ColorSwatch color="transparent" />
              </button>
            )}
          </div>
        </section>
      </PopoverContent>
    </Popover>
  )
}

function ColorChoices({
  label,
  colors,
  current,
  onChange,
}: {
  label: string
  colors: string[]
  current: string
  onChange: (color: string) => void
}) {
  return (
    <section aria-label={label} className="space-y-2 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Use document color ${color}`}
            title={color}
            className="relative h-7 w-7 rounded-md border shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ background: color }}
            onClick={() => onChange(color)}
          >
            {current === color && <Check className="absolute inset-1 h-5 w-5 text-white drop-shadow" />}
          </button>
        ))}
      </div>
    </section>
  )
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="block h-4 w-4 shrink-0 rounded-full border border-border shadow-sm"
      style={{
        background:
          color === 'transparent'
            ? 'linear-gradient(135deg, transparent 43%, #ef4444 44%, #ef4444 56%, transparent 57%), #fff'
            : color,
      }}
    />
  )
}

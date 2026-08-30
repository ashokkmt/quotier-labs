import type { CSSProperties, PointerEvent } from 'react'
import type { Bounds } from './geometry'
import type { ResizeHandle } from './commands'

export type SelectionMeasurement = { label: string; placement?: 'top' | 'bottom' }

const handleCursor = (handle: ResizeHandle, rotation: number): CSSProperties['cursor'] => {
  const base: Record<ResizeHandle, number> = {
    e: 0,
    se: 45,
    s: 90,
    sw: 135,
    w: 180,
    nw: 225,
    n: 270,
    ne: 315,
  }
  const angle = (((base[handle] + rotation / 100) % 180) + 180) % 180
  if (angle < 22.5 || angle >= 157.5) return 'ew-resize'
  if (angle < 67.5) return 'nwse-resize'
  if (angle < 112.5) return 'ns-resize'
  return 'nesw-resize'
}

/**
 * Screen-projection chrome only. It deliberately contains no printable node pixels or document
 * state: the canvas is responsible for passing capability-gated handles and preview bounds.
 */
export function SelectionOverlay({
  bounds,
  rotation = 0,
  handles = [],
  onHandlePointerDown,
  onRotatePointerDown,
  canRotate = false,
  measurement,
  kind = 'single',
}: {
  bounds: Bounds
  rotation?: number
  handles?: ResizeHandle[]
  onHandlePointerDown?: (handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) => void
  onRotatePointerDown?: (event: PointerEvent<HTMLButtonElement>) => void
  canRotate?: boolean
  measurement?: SelectionMeasurement | null
  kind?: 'single' | 'union'
}) {
  const style: CSSProperties = {
    position: 'absolute',
    left: bounds.x,
    top: bounds.y,
    width: Math.max(bounds.width, 1),
    height: Math.max(bounds.height, 1),
    border: '1.5px solid #2563eb',
    transform: rotation ? `rotate(${rotation / 100}deg)` : undefined,
    transformOrigin: 'center',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  }
  return (
    <div
      aria-label={kind === 'union' ? 'Multiple selection' : 'Selection'}
      data-v5-selection
      style={style}
    >
      {canRotate && onRotatePointerDown && (
        <button
          type="button"
          aria-label="Rotate selection"
          onPointerDown={onRotatePointerDown}
          className="absolute left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border border-primary bg-background text-primary shadow-sm outline-none transition-colors duration-75 hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
          style={{ top: -34, pointerEvents: 'auto' }}
        >
          <span aria-hidden className="text-xs leading-none">
            ↻
          </span>
        </button>
      )}
      {canRotate && (
        <span
          aria-hidden
          className="absolute left-1/2 h-3 -translate-x-1/2 border-l border-primary/70"
          style={{ top: -12 }}
        />
      )}
      {handles.map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={`Resize ${handle}`}
          onPointerDown={(event) => onHandlePointerDown?.(handle, event)}
          className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-sm border-0 bg-transparent p-0 text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            pointerEvents: 'auto',
            cursor: handleCursor(handle, rotation),
            ...(handle.includes('n')
              ? { top: 0 }
              : handle.includes('s')
                ? { top: '100%' }
                : { top: '50%' }),
            ...(handle.includes('w')
              ? { left: 0 }
              : handle.includes('e')
                ? { left: '100%' }
                : { left: '50%' }),
          }}
        >
          <span
            aria-hidden
            className="block h-2.5 w-2.5 rounded-[2px] border border-current bg-background shadow-sm transition-colors duration-75 group-hover:bg-primary"
          />
        </button>
      ))}
      {measurement && (
        <span
          className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background shadow-sm"
          style={{ top: measurement.placement === 'bottom' ? 'calc(100% + 12px)' : -28 }}
        >
          {measurement.label}
        </span>
      )}
    </div>
  )
}

/** Lightweight member chrome used only while a multi-selection is active. */
export function MemberSelectionOutline({
  bounds,
  rotation = 0,
  primary = false,
}: {
  bounds: Bounds
  rotation?: number
  primary?: boolean
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: Math.max(bounds.width, 1),
        height: Math.max(bounds.height, 1),
        border: '1px solid rgb(147 197 253)',
        transform: rotation ? `rotate(${rotation / 100}deg)` : undefined,
        transformOrigin: 'center',
        pointerEvents: 'none',
        boxSizing: 'border-box',
      }}
    >
      {primary && (
        <span className="absolute -right-1 -top-1 block h-2 w-2 rounded-full border border-background bg-primary" />
      )}
    </div>
  )
}

export function HoverOutline({ bounds, rotation = 0 }: { bounds: Bounds; rotation?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: Math.max(bounds.width, 1),
        height: Math.max(bounds.height, 1),
        border: '1px solid rgb(147 197 253 / .85)',
        transform: rotation ? `rotate(${rotation / 100}deg)` : undefined,
        transformOrigin: 'center',
        pointerEvents: 'none',
        boxSizing: 'border-box',
        transition: 'opacity 75ms ease-out',
      }}
    />
  )
}

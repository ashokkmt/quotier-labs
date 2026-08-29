import type { PointerEvent } from 'react'
import type { Bounds } from './geometry'
import type { ResizeHandle } from './commands'

export function SelectionOverlay({
  bounds,
  onHandlePointerDown,
  onRotatePointerDown,
}: {
  bounds: Bounds
  onHandlePointerDown: (handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) => void
  onRotatePointerDown: (event: PointerEvent<HTMLButtonElement>) => void
}) {
  const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  return (
    <div
      aria-label="Selection"
      data-v5-selection
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: Math.max(bounds.width, 1),
        height: Math.max(bounds.height, 1),
        border: '1px solid #2563eb',
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        aria-label="Rotate selection"
        onPointerDown={onRotatePointerDown}
        style={{
          position: 'absolute',
          left: 'calc(50% - 5px)',
          top: -28,
          width: 10,
          height: 10,
          borderRadius: 99,
          pointerEvents: 'auto',
          padding: 0,
        }}
      />
      {handles.map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={`Resize ${handle}`}
          onPointerDown={(event) => onHandlePointerDown(handle, event)}
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            pointerEvents: 'auto',
            padding: 0,
            ...(handle.includes('n')
              ? { top: -4 }
              : handle.includes('s')
                ? { bottom: -4 }
                : { top: 'calc(50% - 4px)' }),
            ...(handle.includes('w')
              ? { left: -4 }
              : handle.includes('e')
                ? { right: -4 }
                : { left: 'calc(50% - 4px)' }),
          }}
        />
      ))}
    </div>
  )
}

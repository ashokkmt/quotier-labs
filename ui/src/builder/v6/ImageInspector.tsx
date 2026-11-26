import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { AppSelect } from '@/components/ui/select'

export function ImageInspector({ editor, onReplace }: { editor: Editor; onReplace: () => void }) {
  const image = editor.getAttributes('imageBlock')
  const [cropDraft, setCropDraft] = useState(() => ({
    crop_left: Number(image.crop_left || 0),
    crop_top: Number(image.crop_top || 0),
    crop_right: Number(image.crop_right || 0),
    crop_bottom: Number(image.crop_bottom || 0),
  }))
  const set = (attrs: Record<string, unknown>) =>
    editor.chain().focus().updateAttributes('imageBlock', attrs).run()
  const resize = (axis: 'width' | 'height', value: number) => {
    const next = Math.round(value * 283.465)
    const ratio = Number(image.pixel_height || 1) / Number(image.pixel_width || 1)
    set(
      axis === 'width' && image.aspect_lock
        ? { width: next, height: Math.round(next * ratio) }
        : axis === 'height' && image.aspect_lock
          ? { height: next, width: Math.round(next / ratio) }
          : { [axis]: next },
    )
  }
  const layout =
    image.layout_mode ||
    (image.positioning === 'floating' ? (image.layer === 'behind' ? 'behind' : 'front') : 'inline')
  const setLayout = (layout_mode: string) =>
    set({
      layout_mode,
      positioning: layout_mode === 'inline' ? 'inline' : 'floating',
      layer: layout_mode === 'behind' ? 'behind' : 'front',
      ...(layout_mode === 'inline' ? { offset_x: 0, offset_y: 0 } : {}),
    })
  const crop = (edge: keyof typeof cropDraft, value: number) => {
    const next = Math.max(0, Math.min(0.8, value / 100))
    const opposite = (
      {
        crop_left: 'crop_right',
        crop_right: 'crop_left',
        crop_top: 'crop_bottom',
        crop_bottom: 'crop_top',
      } as const
    )[edge]
    setCropDraft((current) => ({
      ...current,
      [edge]: Math.min(next, 0.99 - current[opposite]),
    }))
  }
  const cancelCrop = () =>
    setCropDraft({
      crop_left: Number(image.crop_left || 0),
      crop_top: Number(image.crop_top || 0),
      crop_right: Number(image.crop_right || 0),
      crop_bottom: Number(image.crop_bottom || 0),
    })
  const cropChanged = Object.entries(cropDraft).some(
    ([key, value]) => value !== Number(image[key] || 0),
  )
  return (
    <aside
      className="fixed right-6 top-16 z-40 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
      aria-label="Image options"
    >
      <h2 className="text-sm font-semibold">Image options</h2>
      <p className="mt-1 text-xs text-muted-foreground">Click elsewhere to close.</p>
      <label className="mt-3 grid gap-1 text-xs">
        Width: {Math.round(Number(image.width) / 283.465)} mm
        <input
          aria-label="Image width"
          type="range"
          min="5"
          max="190"
          value={Math.round(Number(image.width) / 283.465)}
          onChange={(event) => resize('width', Number(event.target.value))}
        />
      </label>
      <label className="mt-2 grid gap-1 text-xs">
        Height: {Math.round(Number(image.height) / 283.465)} mm
        <input
          aria-label="Image height"
          type="range"
          min="5"
          max="270"
          value={Math.round(Number(image.height) / 283.465)}
          onChange={(event) => resize('height', Number(event.target.value))}
        />
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs">
        <input
          aria-label="Lock image aspect ratio"
          type="checkbox"
          checked={Boolean(image.aspect_lock)}
          onChange={(event) => set({ aspect_lock: event.target.checked })}
        />
        Lock aspect ratio
      </label>
      <label className="mt-3 grid gap-1 text-xs">
        Text flow
        <AppSelect
          label="Image text flow"
          value={layout}
          options={[
            { value: 'inline', label: 'In line with text' },
            { value: 'wrap', label: 'Wrap text' },
            { value: 'break', label: 'Break text' },
            { value: 'behind', label: 'Behind text' },
            { value: 'front', label: 'In front of text' },
          ]}
          onValueChange={setLayout}
        />
      </label>
      {layout !== 'inline' && (
        <>
          <label className="mt-2 grid gap-1 text-xs">
            Position
            <AppSelect
              label="Image position"
              value={image.position_mode || 'move_with_text'}
              options={[
                { value: 'move_with_text', label: 'Move with text' },
                { value: 'fixed_on_page', label: 'Fix on page' },
              ]}
              onValueChange={(position_mode) => set({ position_mode })}
            />
          </label>
          {layout === 'wrap' && (
            <label className="mt-2 grid gap-1 text-xs">
              Wrap margin: {Math.round(Number(image.wrap_margin || 0) / 283.465)} mm
              <input
                aria-label="Image wrap margin"
                type="range"
                min="0"
                max="20"
                value={Math.round(Number(image.wrap_margin || 0) / 283.465)}
                onChange={(event) =>
                  set({ wrap_margin: Math.round(Number(event.target.value) * 283.465) })
                }
              />
            </label>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Drag the selected image to move it.</p>
        </>
      )}
      <label className="mt-3 grid gap-1 text-xs">
        Rotation: {Math.round(Number(image.rotation || 0))}°
        <input
          aria-label="Image rotation"
          type="range"
          min="-180"
          max="180"
          value={Number(image.rotation || 0)}
          onChange={(event) => set({ rotation: Number(event.target.value) })}
        />
      </label>
      <fieldset className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <legend className="col-span-2 mb-1 font-medium">Crop</legend>
        {(['crop_left', 'crop_top', 'crop_right', 'crop_bottom'] as const).map((edge) => (
          <label key={edge} className="grid gap-1 capitalize">
            {edge.replace('crop_', '')}
            <input
              aria-label={`Crop ${edge.replace('crop_', '')}`}
              type="range"
              min="0"
              max="80"
              value={Math.round(cropDraft[edge] * 100)}
              onChange={(event) => crop(edge, Number(event.target.value))}
            />
          </label>
        ))}
      </fieldset>
      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!cropChanged}
          onClick={cancelCrop}
        >
          Cancel crop
        </Button>
        <Button type="button" size="sm" disabled={!cropChanged} onClick={() => set(cropDraft)}>
          Apply crop
        </Button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onReplace}>
          Replace
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => editor.chain().focus().deleteSelection().run()}
        >
          Delete
        </Button>
      </div>
    </aside>
  )
}

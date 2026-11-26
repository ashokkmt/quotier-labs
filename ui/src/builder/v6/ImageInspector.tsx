import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { AppSelect } from '@/components/ui/select'

export function ImageInspector({ editor, onReplace }: { editor: Editor; onReplace: () => void }) {
  const image = editor.getAttributes('imageBlock')
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
  const layout = image.layout_mode || (image.positioning === 'floating' ? image.layer === 'behind' ? 'behind' : 'front' : 'inline')
  const setLayout = (layout_mode: string) =>
    set({
      layout_mode,
      positioning: layout_mode === 'inline' ? 'inline' : 'floating',
      layer: layout_mode === 'behind' ? 'behind' : 'front',
      ...(layout_mode === 'inline' ? { offset_x: 0, offset_y: 0 } : {}),
    })
  const crop = (edge: 'crop_left' | 'crop_top' | 'crop_right' | 'crop_bottom', value: number) =>
    set({ [edge]: Math.max(0, Math.min(0.8, value / 100)) })
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
          {layout === 'wrap' && <label className="mt-2 grid gap-1 text-xs">Wrap margin: {Math.round(Number(image.wrap_margin || 0) / 283.465)} mm<input aria-label="Image wrap margin" type="range" min="0" max="20" value={Math.round(Number(image.wrap_margin || 0) / 283.465)} onChange={(event) => set({ wrap_margin: Math.round(Number(event.target.value) * 283.465) })} /></label>}
          <p className="mt-2 text-xs text-muted-foreground">Drag the selected image to move it.</p>
        </>
      )}
      <label className="mt-3 grid gap-1 text-xs">Rotation: {Math.round(Number(image.rotation || 0))}°<input aria-label="Image rotation" type="range" min="-180" max="180" value={Number(image.rotation || 0)} onChange={(event) => set({ rotation: Number(event.target.value) })} /></label>
      <fieldset className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <legend className="col-span-2 mb-1 font-medium">Crop</legend>
        {(['crop_left', 'crop_top', 'crop_right', 'crop_bottom'] as const).map((edge) => <label key={edge} className="grid gap-1 capitalize">{edge.replace('crop_', '')}<input aria-label={`Crop ${edge.replace('crop_', '')}`} type="range" min="0" max="80" value={Math.round(Number(image[edge] || 0) * 100)} onChange={(event) => crop(edge, Number(event.target.value))} /></label>)}
      </fieldset>
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

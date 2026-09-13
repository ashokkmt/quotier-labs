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
          value={image.positioning || 'inline'}
          options={[
            { value: 'inline', label: 'In line with text' },
            { value: 'floating', label: 'Top and bottom (movable)' },
          ]}
          onValueChange={(positioning) =>
            set({ positioning, ...(positioning === 'inline' ? { offset_x: 0, offset_y: 0 } : {}) })
          }
        />
      </label>
      {image.positioning === 'floating' && (
        <>
          <label className="mt-2 grid gap-1 text-xs">
            Layer
            <AppSelect
              label="Image overlap layer"
              value={image.layer || 'front'}
              options={[
                { value: 'front', label: 'In front of text' },
                { value: 'behind', label: 'Behind text' },
              ]}
              onValueChange={(layer) => set({ layer })}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">Drag the selected image to move it.</p>
        </>
      )}
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

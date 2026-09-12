import type { Editor } from '@tiptap/react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ImagePlus,
  Italic,
  Redo2,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ControlledColorPicker } from '../v5/ColorPicker'
import { colorValueToCSS } from '../v5/tokens'
import type { V6Document } from './model'
import { nodeID, usedColorsForV6 } from './model'

export function Toolbar({
  editor,
  document,
  onInsertImage,
  onExportDOCX,
}: {
  editor: Editor
  document: V6Document
  onInsertImage: () => void
  onExportDOCX: () => void
}) {
  const textStyle = editor.getAttributes('textStyle')
  const paragraph = editor.getAttributes('paragraph')
  const cell = editor.getAttributes('tableCell')
  const image = editor.getAttributes('imageBlock')
  const button = (label: string, active: boolean, action: () => void, icon: React.ReactNode) => (
    <Button
      key={label}
      type="button"
      size="icon"
      variant={active ? 'secondary' : 'ghost'}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
      className="h-8 w-8"
    >
      {icon}
    </Button>
  )
  const paragraphAttr = (name: string, value: unknown) =>
    editor
      .chain()
      .focus()
      .updateAttributes('paragraph', { [name]: value })
      .run()
  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b bg-background p-2"
      role="toolbar"
      aria-label="Document formatting"
    >
      {button(
        'Undo',
        false,
        () => editor.chain().focus().undo().run(),
        <Undo2 className="h-4 w-4" />,
      )}
      {button(
        'Redo',
        false,
        () => editor.chain().focus().redo().run(),
        <Redo2 className="h-4 w-4" />,
      )}
      <select
        aria-label="Font family"
        className="h-8 rounded-md border bg-background px-2 text-sm"
        value={textStyle.fontFamily || 'Quotier Sans'}
        onChange={(event) =>
          editor
            .chain()
            .focus()
            .setMark('textStyle', { ...textStyle, fontFamily: event.target.value })
            .run()
        }
      >
        <option>Quotier Sans</option>
        <option>Quotier Serif</option>
        <option>Quotier Mono</option>
      </select>
      <Input
        aria-label="Font size in points"
        className="h-8 w-16"
        type="number"
        min={6}
        max={72}
        value={Number(textStyle.fontSize || 1000) / 100}
        onChange={(event) =>
          editor
            .chain()
            .focus()
            .setMark('textStyle', {
              ...textStyle,
              fontSize: Math.round(Number(event.target.value) * 100),
            })
            .run()
        }
      />
      {button(
        'Bold',
        editor.isActive('bold'),
        () => editor.chain().focus().toggleBold().run(),
        <Bold className="h-4 w-4" />,
      )}
      {button(
        'Italic',
        editor.isActive('italic'),
        () => editor.chain().focus().toggleItalic().run(),
        <Italic className="h-4 w-4" />,
      )}
      {button(
        'Underline',
        editor.isActive('underline'),
        () => editor.chain().focus().toggleUnderline().run(),
        <Underline className="h-4 w-4" />,
      )}
      <ControlledColorPicker
        compact
        label="Text color"
        value={textStyle.color || '#111827'}
        usedColors={usedColorsForV6(document)}
        allowTransparent={false}
        onChange={(color) =>
          editor
            .chain()
            .focus()
            .setMark('textStyle', { ...textStyle, color: colorValueToCSS(color) })
            .run()
        }
      />
      <ControlledColorPicker
        compact
        label="Text highlight"
        value={editor.getAttributes('highlight').color || '#FEF08A'}
        usedColors={usedColorsForV6(document)}
        allowTransparent={false}
        onChange={(color) =>
          editor
            .chain()
            .focus()
            .setHighlight({ color: colorValueToCSS(color) })
            .run()
        }
      />
      {(['left', 'center', 'right'] as const).map((alignment) =>
        button(
          `${alignment} align`,
          paragraph.alignment === alignment,
          () => paragraphAttr('alignment', alignment),
          alignment === 'left' ? (
            <AlignLeft className="h-4 w-4" />
          ) : alignment === 'center' ? (
            <AlignCenter className="h-4 w-4" />
          ) : (
            <AlignRight className="h-4 w-4" />
          ),
        ),
      )}
      <label className="flex items-center gap-1 text-xs">
        Before{' '}
        <Input
          className="h-8 w-16"
          aria-label="Paragraph spacing before in points"
          type="number"
          min={0}
          max={72}
          value={Number(paragraph.spacing_before || 0) / 100}
          onChange={(e) =>
            paragraphAttr('spacing_before', Math.round(Number(e.target.value) * 100))
          }
        />
      </label>
      <label className="flex items-center gap-1 text-xs">
        After{' '}
        <Input
          className="h-8 w-16"
          aria-label="Paragraph spacing after in points"
          type="number"
          min={0}
          max={72}
          value={Number(paragraph.spacing_after || 0) / 100}
          onChange={(e) => paragraphAttr('spacing_after', Math.round(Number(e.target.value) * 100))}
        />
      </label>
      <select
        aria-label="Line spacing"
        className="h-8 rounded-md border bg-background px-2 text-sm"
        value={paragraph.line_height || 1.2}
        onChange={(e) => paragraphAttr('line_height', Number(e.target.value))}
      >
        <option value="1">1.0</option>
        <option value="1.2">1.2</option>
        <option value="1.5">1.5</option>
        <option value="2">2.0</option>
      </select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 2, cols: 3, withHeaderRow: false })
            .updateAttributes('table', { id: nodeID(), column_widths: [15000, 15000, 15000] })
            .run()
        }
      >
        <Table2 className="mr-1 h-4 w-4" /> Table
      </Button>
      {editor.isActive('table') && (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            + Row
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            − Row
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            + Column
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            − Column
          </Button>
          <ControlledColorPicker
            compact
            label="Cell background"
            value={cell.background || 'transparent'}
            usedColors={usedColorsForV6(document)}
            onChange={(background) =>
              editor
                .chain()
                .focus()
                .updateAttributes('tableCell', {
                  background:
                    background === 'transparent' ? background : colorValueToCSS(background),
                })
                .run()
            }
          />
          <select
            aria-label="Cell text alignment"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={cell.alignment || 'left'}
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .updateAttributes('tableCell', { alignment: event.target.value })
                .run()
            }
          >
            <option value="left">Cell left</option>
            <option value="center">Cell center</option>
            <option value="right">Cell right</option>
          </select>
        </>
      )}
      <Button type="button" size="sm" variant="outline" onClick={onInsertImage}>
        <ImagePlus className="mr-1 h-4 w-4" /> Image
      </Button>
      {editor.isActive('imageBlock') && (
        <>
          <label className="flex items-center gap-1 text-xs">
            Image width{' '}
            <Input
              aria-label="Image width in millimetres"
              className="h-8 w-16"
              type="number"
              min={5}
              max={190}
              value={Math.round(Number(image.width || 7500) / 283.465)}
              onChange={(event) => {
                const width = Math.round(Number(event.target.value) * 283.465)
                const ratio = Number(image.pixel_height || 1) / Number(image.pixel_width || 1)
                editor
                  .chain()
                  .focus()
                  .updateAttributes('imageBlock', { width, height: Math.round(width * ratio) })
                  .run()
              }}
            />
          </label>
          <select
            aria-label="Image alignment"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={image.alignment || 'left'}
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .updateAttributes('imageBlock', { alignment: event.target.value })
                .run()
            }
          >
            <option value="left">Image left</option>
            <option value="center">Image center</option>
            <option value="right">Image right</option>
          </select>
          <Input
            aria-label="Image alternative text"
            className="h-8 w-40"
            maxLength={300}
            placeholder="Image description"
            value={image.alt || ''}
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .updateAttributes('imageBlock', { alt: event.target.value })
                .run()
            }
          />
        </>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'lineItemTable',
              attrs: {
                id: nodeID(),
                rows: [
                  {
                    id: nodeID(),
                    description: '',
                    quantity: 1,
                    rate: 0,
                    discount: 0,
                    tax_rate: 18,
                    tax_inclusive: false,
                  },
                ],
              },
            })
            .run()
        }
      >
        Line items
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({ type: 'pageBreak', attrs: { id: nodeID() } })
            .run()
        }
      >
        Page break
      </Button>
      <Button type="button" size="sm" onClick={onExportDOCX}>
        DOCX
      </Button>
    </div>
  )
}

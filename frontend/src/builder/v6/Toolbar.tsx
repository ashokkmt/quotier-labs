import type { Editor } from '@tiptap/react'
import { Bold, Italic, Redo2, Settings2, Strikethrough, Underline, Undo2 } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { AppSelect } from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { V6Document } from './model'
import { V6_STYLE_NAMES } from './model'
import {
  markAttributeSelectionValue,
  markSelectionState,
  paragraphSelectionValue,
  setTextStyleAttribute,
} from './selectionState'
import {
  AlignmentMenu,
  CompactFormattingMenu,
  ColorFormattingPopover,
  ImageSettings,
  FieldSettings,
  InsertMenu,
  LinkPopover,
  LineSpacingMenu,
  ListMenu,
  MoreMenu,
  ParagraphSettings,
  ToolbarIconButton,
} from './ToolbarMenus'

const FONT_SIZES = [6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]

export function Toolbar({
  editor,
  document,
  onInsertImage,
  onReplaceImage,
  onExportDOCX,
  onOpenSettings,
}: {
  editor: Editor
  document: V6Document
  onInsertImage: () => void
  onReplaceImage: () => void
  onExportDOCX: () => void
  onOpenSettings: () => void
}) {
  const paragraphStyle = paragraphSelectionValue(editor, 'style', 'Normal')
  const fontFamily = markAttributeSelectionValue(editor, 'textStyle', 'fontFamily', 'Quotier Sans')
  const fontSize = markAttributeSelectionValue(editor, 'textStyle', 'fontSize', 1000)
  const currentFontPoints = fontSize === 'mixed' ? null : Number(fontSize) / 100
  const fontSizes = currentFontPoints
    ? [...new Set([...FONT_SIZES, currentFontPoints])].sort((left, right) => left - right)
    : FONT_SIZES
  const toggleMark = (name: string) => {
    const state = markSelectionState(editor, name)
    return state === 'mixed'
      ? editor.chain().focus().setMark(name).run()
      : editor.chain().focus().toggleMark(name).run()
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1 overflow-hidden border-b bg-background/95 px-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85"
        role="toolbar"
        aria-label="Document formatting"
        onKeyDown={(event) => {
          if (
            !(event.target instanceof HTMLButtonElement) ||
            !['ArrowLeft', 'ArrowRight'].includes(event.key)
          )
            return
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          ).filter((button) => button.offsetParent !== null)
          const current = buttons.indexOf(event.target)
          if (current < 0) return
          event.preventDefault()
          buttons[
            (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
          ]?.focus()
        }}
      >
        <ToolbarIconButton
          label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarIconButton>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <AppSelect
          label="Paragraph style"
          className="h-8 w-28 shrink-0 px-2 sm:w-32"
          value={paragraphStyle === 'mixed' ? '__mixed__' : paragraphStyle}
          options={[
            ...(paragraphStyle === 'mixed'
              ? [{ value: '__mixed__', label: 'Mixed styles', disabled: true }]
              : []),
            ...V6_STYLE_NAMES.map((name) => ({ value: name, label: name })),
          ]}
          onValueChange={(value) =>
            editor
              .chain()
              .focus()
              .updateAttributes('paragraph', {
                style: value,
                alignment: null,
                spacing_before: 0,
                spacing_after: 0,
                line_height: null,
                left_indent: 0,
                first_line_indent: 0,
                hanging_indent: 0,
                right_indent: 0,
              })
              .run()
          }
        />
        <div className="hidden lg:block">
          <AppSelect
            label="Font family"
            className="h-8 w-32 px-2"
            value={fontFamily === 'mixed' ? '__mixed__' : String(fontFamily)}
            options={[
              ...(fontFamily === 'mixed'
                ? [{ value: '__mixed__', label: 'Mixed fonts', disabled: true }]
                : []),
              ...['Quotier Sans', 'Quotier Serif', 'Quotier Mono'].map((value) => ({
                value,
                label: value,
              })),
            ]}
            onValueChange={(value) => setTextStyleAttribute(editor, 'fontFamily', value)}
          />
        </div>
        <AppSelect
          label="Font size in points"
          className="h-8 w-[4.5rem] shrink-0 px-2"
          value={fontSize === 'mixed' ? '__mixed__' : String(Number(fontSize) / 100)}
          options={[
            ...(fontSize === 'mixed'
              ? [{ value: '__mixed__', label: 'Mixed', disabled: true }]
              : []),
            ...fontSizes.map((size) => ({ value: String(size), label: `${size} pt` })),
          ]}
          onValueChange={(points) =>
            setTextStyleAttribute(editor, 'fontSize', Math.round(Number(points) * 100))
          }
        />
        <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
        <ToolbarIconButton
          label="Bold"
          active={markSelectionState(editor, 'bold')}
          onClick={() => toggleMark('bold')}
        >
          <Bold className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Italic"
          active={markSelectionState(editor, 'italic')}
          onClick={() => toggleMark('italic')}
        >
          <Italic className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Underline"
          active={markSelectionState(editor, 'underline')}
          onClick={() => toggleMark('underline')}
          className="hidden sm:inline-flex"
        >
          <Underline className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Strikethrough"
          active={markSelectionState(editor, 'strike')}
          onClick={() => toggleMark('strike')}
          className="hidden lg:inline-flex"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarIconButton>
        <ColorFormattingPopover editor={editor} document={document} />
        <Separator orientation="vertical" className="mx-1 hidden h-6 lg:block" />
        <div className="hidden items-center gap-1 lg:flex">
          <AlignmentMenu editor={editor} />
          <LineSpacingMenu editor={editor} />
          <ListMenu editor={editor} />
          <ParagraphSettings editor={editor} />
          <LinkPopover editor={editor} />
        </div>
        <CompactFormattingMenu editor={editor} />
        <InsertMenu editor={editor} onInsertImage={onInsertImage} />
        <ImageSettings editor={editor} onReplace={onReplaceImage} />
        <FieldSettings editor={editor} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <MoreMenu editor={editor} onExportDOCX={onExportDOCX} />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <ToolbarIconButton
            id="v6-document-settings-trigger"
            label="Document settings"
            onClick={onOpenSettings}
          >
            <Settings2 className="h-4 w-4" />
          </ToolbarIconButton>
        </div>
      </div>
    </TooltipProvider>
  )
}

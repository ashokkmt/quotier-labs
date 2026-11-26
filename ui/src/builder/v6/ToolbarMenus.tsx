import { useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalSpaceAround,
  ChevronDown,
  ImagePlus,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Pilcrow,
  Plus,
  SlidersHorizontal,
  Strikethrough,
  Underline,
  Braces,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AppSelect } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ControlledColorPicker } from './ColorPicker'
import { colorValueToCSS } from './color'
import { isSafeV6Link, nodeID, usedColorsForV6, V6_FIELD_KEYS, type V6Document } from './model'
import { paragraphSelectionValue, setTextStyleAttribute } from './selectionState'
import { Ruler } from './Ruler'
import { BoundedNumberInput } from './BoundedNumberInput'

export function ToolbarIconButton({
  label,
  active = false,
  disabled,
  onClick,
  children,
  className = '',
  id,
}: {
  label: string
  active?: boolean | 'mixed'
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id={id}
          type="button"
          size="icon"
          variant={active === false ? 'ghost' : 'secondary'}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={`h-8 w-8 shrink-0 transition-colors duration-150 motion-reduce:transition-none ${className}`}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ColorFormattingPopover({
  editor,
  document,
}: {
  editor: Editor
  document: V6Document
}) {
  const textStyle = editor.getAttributes('textStyle')
  return (
    <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
      <span>Text</span>
      <ControlledColorPicker
        compact
        label="Text color"
        value={textStyle.color || '#111827'}
        usedColors={usedColorsForV6(document)}
        allowTransparent={false}
        onChange={(value) => setTextStyleAttribute(editor, 'color', colorValueToCSS(value))}
      />
      <span>Highlight</span>
      <ControlledColorPicker
        compact
        label="Text highlight"
        value={editor.getAttributes('highlight').color || 'transparent'}
        usedColors={usedColorsForV6(document)}
        onChange={(value) =>
          value === 'transparent'
            ? editor.chain().focus().unsetHighlight().run()
            : editor
                .chain()
                .focus()
                .setHighlight({ color: colorValueToCSS(value) })
                .run()
        }
      />
    </div>
  )
}

export function AlignmentMenu({ editor }: { editor: Editor }) {
  const current = paragraphSelectionValue<string | null>(editor, 'alignment', null)
  const choices = [
    ['left', 'Align left', AlignLeft],
    ['center', 'Align center', AlignCenter],
    ['right', 'Align right', AlignRight],
    ['justify', 'Justify', AlignJustify],
  ] as const
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label="Paragraph alignment"
        >
          {current === 'center' ? (
            <AlignCenter />
          ) : current === 'right' ? (
            <AlignRight />
          ) : current === 'justify' ? (
            <AlignJustify />
          ) : (
            <AlignLeft />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {choices.map(([value, label, Icon]) => (
          <DropdownMenuItem
            key={value}
            onSelect={() =>
              editor.chain().focus().updateAttributes('paragraph', { alignment: value }).run()
            }
          >
            <Icon /> {label}
            {current === value && <span className="ml-auto">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LineSpacingMenu({ editor }: { editor: Editor }) {
  const current = paragraphSelectionValue(editor, 'line_height', 1.2)
  const choices = [
    ['1', 'Single'],
    ['1.2', '1.2'],
    ['1.5', '1.5'],
    ['2', 'Double'],
  ] as const
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label="Line spacing"
        >
          <AlignVerticalSpaceAround className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Line spacing</DropdownMenuLabel>
        {choices.map(([value, label]) => (
          <DropdownMenuItem
            key={value}
            onSelect={() =>
              editor
                .chain()
                .focus()
                .updateAttributes('paragraph', { line_height: Number(value) })
                .run()
            }
          >
            {label}
            {current !== 'mixed' && Number(current) === Number(value) && (
              <span className="ml-auto">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ListMenu({ editor }: { editor: Editor }) {
  const inList = editor.isActive('bulletList') || editor.isActive('orderedList')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={inList ? 'secondary' : 'ghost'}
          className="h-8 shrink-0 gap-1 px-2"
          aria-label="Lists"
        >
          <List className="h-4 w-4" />
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleBulletList().run()}>
          <List /> Bulleted list
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered /> Numbered list
        </DropdownMenuItem>
        {inList && <DropdownMenuSeparator />}
        {inList && (
          <DropdownMenuItem
            disabled={!editor.can().sinkListItem('listItem')}
            onSelect={() => editor.chain().focus().sinkListItem('listItem').run()}
          >
            Increase indent
          </DropdownMenuItem>
        )}
        {inList && (
          <DropdownMenuItem
            disabled={!editor.can().liftListItem('listItem')}
            onSelect={() => editor.chain().focus().liftListItem('listItem').run()}
          >
            Decrease indent
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ParagraphSettings({ editor }: { editor: Editor }) {
  const spacingBefore = paragraphSelectionValue(editor, 'spacing_before', 0)
  const spacingAfter = paragraphSelectionValue(editor, 'spacing_after', 0)
  const lineHeight = paragraphSelectionValue(editor, 'line_height', 1.2)
  const paragraph = {
    left_indent: paragraphSelectionValue(editor, 'left_indent', 0),
    first_line_indent: paragraphSelectionValue(editor, 'first_line_indent', 0),
    hanging_indent: paragraphSelectionValue(editor, 'hanging_indent', 0),
    right_indent: paragraphSelectionValue(editor, 'right_indent', 0),
  }
  const set = (name: string, value: unknown) =>
    editor
      .chain()
      .focus()
      .updateAttributes('paragraph', { [name]: value })
      .run()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label="Paragraph spacing and indents"
        >
          <Pilcrow className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-[36rem] max-w-[calc(100vw-2rem)] gap-3 p-3" align="start">
        <div className="grid grid-cols-3 gap-2">
          <label className="grid gap-1 text-xs">
            Before
            <BoundedNumberInput
              label="Paragraph spacing before in points"
              className="h-8"
              min={0}
              max={72}
              value={spacingBefore === 'mixed' ? '' : Number(spacingBefore) / 100}
              placeholder={spacingBefore === 'mixed' ? 'Mixed' : undefined}
              onCommit={(value) => set('spacing_before', Math.round(value * 100))}
            />
          </label>
          <label className="grid gap-1 text-xs">
            After
            <BoundedNumberInput
              label="Paragraph spacing after in points"
              className="h-8"
              min={0}
              max={72}
              value={spacingAfter === 'mixed' ? '' : Number(spacingAfter) / 100}
              placeholder={spacingAfter === 'mixed' ? 'Mixed' : undefined}
              onCommit={(value) => set('spacing_after', Math.round(value * 100))}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Line spacing
            <AppSelect
              label="Line spacing"
              className="h-8"
              value={lineHeight === 'mixed' ? '__mixed__' : String(lineHeight)}
              options={[
                ...(lineHeight === 'mixed'
                  ? [{ value: '__mixed__', label: 'Mixed', disabled: true }]
                  : []),
                { value: '1', label: 'Single' },
                { value: '1.2', label: '1.2' },
                { value: '1.5', label: '1.5' },
                { value: '2', label: 'Double' },
              ]}
              onValueChange={(value) => set('line_height', Number(value))}
            />
          </label>
        </div>
        <Ruler
          compact
          values={paragraph}
          onChange={(patch) => editor.chain().focus().updateAttributes('paragraph', patch).run()}
        />
      </PopoverContent>
    </Popover>
  )
}

export function LinkPopover({ editor }: { editor: Editor }) {
  const [value, setValue] = useState('')
  const current = String(editor.getAttributes('link').href || '')
  const apply = () => {
    const href = value.trim() || current
    if (isSafeV6Link(href)) editor.chain().focus().setLink({ href }).run()
  }
  return (
    <Popover onOpenChange={(open) => open && setValue(current)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive('link') ? 'secondary' : 'ghost'}
          className="h-8 w-8 shrink-0"
          aria-label="Link"
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <label className="grid gap-2 text-xs">
          Link address
          <Input
            autoFocus
            value={value}
            placeholder="https://…"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && apply()}
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!editor.isActive('link')}
            onClick={() => editor.chain().focus().unsetLink().run()}
          >
            Remove
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!isSafeV6Link(value.trim() || current)}
            onClick={apply}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function InsertMenu({
  editor,
  onInsertImage,
}: {
  editor: Editor
  onInsertImage: () => void
}) {
  const insert = (content: object) => editor.chain().focus().insertContent(content).run()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 gap-1 px-2">
          <Plus className="h-4 w-4" /> Insert
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onSelect={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 2, cols: 3, withHeaderRow: false })
              .updateAttributes('table', { id: nodeID(), column_widths: [15000, 15000, 15000] })
              .run()
          }
        >
          Table
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onInsertImage}>
          <ImagePlus /> Image
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            insert({
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
          }
        >
          Line items
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Business field</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 overflow-auto">
            {V6_FIELD_KEYS.map((key) => (
              <DropdownMenuItem
                key={key}
                onSelect={() =>
                  insert({
                    type: 'field',
                    attrs: { id: nodeID(), key, fallback: '', empty_behavior: 'diagnostic' },
                  })
                }
              >
                {fieldLabel(key)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={editor.isActive('table')}
          onSelect={() => insert({ type: 'horizontalRule', attrs: { id: nodeID() } })}
        >
          Horizontal rule
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => insert({ type: 'pageBreak', attrs: { id: nodeID() } })}>
          Page break
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().setHardBreak().run()}>
          Line break
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.chain().focus().insertContent('\u00a0').run()}>
          Non-breaking space
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ImageSettings({ editor, onReplace }: { editor: Editor; onReplace: () => void }) {
  const image = editor.getAttributes('imageBlock')
  if (!editor.isActive('imageBlock')) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-8 w-8 shrink-0"
          aria-label="Image settings"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-72 gap-3 p-3" align="start">
        <label className="grid gap-1 text-xs">
          Width (mm)
          <BoundedNumberInput
            label="Image width in millimetres"
            min={5}
            max={190}
            value={Math.round(Number(image.width || 7500) / 283.465)}
            onCommit={(value) => {
              const width = Math.round(value * 283.465)
              const ratio = image.aspect_lock
                ? Number(image.pixel_height || 1) / Number(image.pixel_width || 1)
                : Number(image.height || 1) / Number(image.width || 1)
              editor
                .chain()
                .focus()
                .updateAttributes('imageBlock', { width, height: Math.round(width * ratio) })
                .run()
            }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          Height (mm)
          <BoundedNumberInput
            label="Image height in millimetres"
            min={5}
            max={270}
            value={Math.round(Number(image.height || 7500) / 283.465)}
            onCommit={(value) => {
              const height = Math.round(value * 283.465)
              const ratio = Number(image.pixel_width || 1) / Number(image.pixel_height || 1)
              editor
                .chain()
                .focus()
                .updateAttributes(
                  'imageBlock',
                  image.aspect_lock ? { height, width: Math.round(height * ratio) } : { height },
                )
                .run()
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={Boolean(image.aspect_lock)}
            onCheckedChange={(checked) =>
              editor
                .chain()
                .focus()
                .updateAttributes('imageBlock', { aspect_lock: checked === true })
                .run()
            }
          />
          Lock aspect ratio
        </label>
        <label className="grid gap-1 text-xs">
          Alignment
          <AppSelect
            label="Image alignment"
            value={image.alignment || 'left'}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
            onValueChange={(value) =>
              editor.chain().focus().updateAttributes('imageBlock', { alignment: value }).run()
            }
          />
        </label>
        <label className="grid gap-1 text-xs">
          Alternative text
          <Input
            maxLength={300}
            value={image.alt || ''}
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .updateAttributes('imageBlock', { alt: event.target.value })
                .run()
            }
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs">
            Space before (pt)
            <BoundedNumberInput
              label="Image space before in points"
              min={0}
              max={72}
              value={Number(image.space_before || 0) / 100}
              onCommit={(value) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('imageBlock', { space_before: Math.round(value * 100) })
                  .run()
              }
            />
          </label>
          <label className="grid gap-1 text-xs">
            Space after (pt)
            <BoundedNumberInput
              label="Image space after in points"
              min={0}
              max={72}
              value={Number(image.space_after || 0) / 100}
              onCommit={(value) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('imageBlock', { space_after: Math.round(value * 100) })
                  .run()
              }
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
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
      </PopoverContent>
    </Popover>
  )
}

export function FieldSettings({ editor }: { editor: Editor }) {
  if (!editor.isActive('field')) return null
  const field = editor.getAttributes('field')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-8 w-8 shrink-0"
          aria-label="Business field settings"
        >
          <Braces className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-80 gap-3 p-3" align="start">
        <label className="grid gap-1 text-xs">
          Field
          <AppSelect
            label="Business field"
            value={field.key}
            options={V6_FIELD_KEYS.map((value) => ({ value, label: fieldLabel(value) }))}
            onValueChange={(key) => editor.chain().focus().updateAttributes('field', { key }).run()}
          />
        </label>
        <label className="grid gap-1 text-xs">
          When empty
          <AppSelect
            label="Empty field behavior"
            value={field.empty_behavior || 'diagnostic'}
            options={[
              { value: 'diagnostic', label: 'Require a value' },
              { value: 'fallback', label: 'Show fallback' },
              { value: 'blank', label: 'Leave blank' },
            ]}
            onValueChange={(empty_behavior) =>
              editor.chain().focus().updateAttributes('field', { empty_behavior }).run()
            }
          />
        </label>
        <label className="grid gap-1 text-xs">
          Fallback text
          <Input
            maxLength={300}
            disabled={field.empty_behavior !== 'fallback'}
            value={field.fallback || ''}
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .updateAttributes('field', { fallback: event.target.value })
                .run()
            }
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => editor.chain().focus().deleteSelection().run()}
        >
          Delete field
        </Button>
      </PopoverContent>
    </Popover>
  )
}

const fieldLabel = (key: string) =>
  key
    .split('.')
    .map((part) => part.replaceAll('_', ' '))
    .join(' · ')

export function MoreMenu({
  editor,
  onExportDOCX,
  exportingDOCX,
}: {
  editor: Editor
  onExportDOCX: () => void
  exportingDOCX: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label="More editor actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem
          onSelect={() =>
            editor
              .chain()
              .focus()
              .unsetAllMarks()
              .updateAttributes('paragraph', {
                style: 'Normal',
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
        >
          Clear formatting
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void navigator.clipboard
              ?.readText()
              .then((text) => editor.chain().focus().insertContent(text).run())
              .catch(() => undefined)
          }
        >
          Paste as text <span className="ml-auto text-xs text-muted-foreground">⌘⇧V</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={exportingDOCX} onSelect={onExportDOCX}>
          {exportingDOCX ? 'Exporting DOCX…' : 'Export DOCX'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          Save ⌘S · Undo ⌘Z · Redo ⌘⇧Z
          <br />
          Bold ⌘B · Italic ⌘I · Underline ⌘U
          <br />
          Non-breaking space ⌘⇧Space
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function CompactFormattingMenu({ editor }: { editor: Editor }) {
  const fontFamily = String(editor.getAttributes('textStyle').fontFamily || 'Quotier Sans')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 lg:hidden"
          aria-label="More formatting"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-72 gap-3 p-3" align="start">
        <label className="grid gap-1 text-xs">
          Font family
          <AppSelect
            label="Font family"
            value={fontFamily}
            options={['Quotier Sans', 'Quotier Serif', 'Quotier Mono'].map((value) => ({
              value,
              label: value,
            }))}
            onValueChange={(value) => setTextStyleAttribute(editor, 'fontFamily', value)}
          />
        </label>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Additional inline formatting"
        >
          <ToolbarIconButton
            label="Underline"
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Strikethrough"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarIconButton>
        </div>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Paragraph and link formatting"
        >
          <AlignmentMenu editor={editor} />
          <LineSpacingMenu editor={editor} />
          <ListMenu editor={editor} />
          <ParagraphSettings editor={editor} />
          <LinkPopover editor={editor} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

import { useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AppSelect } from '@/components/ui/select'
import { v6Extensions } from './extensions'
import { nodeID, normalizeV6Story, V6_STYLE_NAMES, type V6StoryKey } from './model'

const storyLabels: Record<V6StoryKey, string> = {
  header_story: 'Default header',
  footer_story: 'Default footer',
  first_page_header_story: 'First-page header',
  first_page_footer_story: 'First-page footer',
}

export function HeaderFooterEditor({
  stories,
  differentFirstPage,
  onStoryChange,
  onDifferentFirstPageChange,
  embedded = false,
}: {
  stories: Record<V6StoryKey, JSONContent>
  differentFirstPage: boolean
  onStoryChange: (key: V6StoryKey, story: JSONContent) => void
  onDifferentFirstPageChange: (value: boolean) => void
  embedded?: boolean
}) {
  const [active, setActive] = useState<V6StoryKey>('header_story')
  const choices: V6StoryKey[] = [
    'header_story',
    'footer_story',
    ...(differentFirstPage
      ? (['first_page_header_story', 'first_page_footer_story'] as V6StoryKey[])
      : []),
  ]
  const selected = choices.includes(active) ? active : 'header_story'
  return (
    <section
      className={embedded ? 'bg-background' : 'border-b bg-background px-3 py-2'}
      aria-labelledby="header-footer-title"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="header-footer-title" className="text-xs font-semibold">
          Headers and footers
        </h3>
        {choices.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={selected === key ? 'secondary' : 'ghost'}
            aria-pressed={selected === key}
            onClick={() => setActive(key)}
          >
            {storyLabels[key]}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs">
          <Checkbox
            checked={differentFirstPage}
            onCheckedChange={(value) => onDifferentFirstPageChange(value === true)}
          />
          Different first page
        </label>
      </div>
      <StoryEditor
        key={selected}
        label={storyLabels[selected]}
        story={stories[selected]}
        onChange={(story) => onStoryChange(selected, story)}
      />
    </section>
  )
}

function StoryEditor({
  label,
  story,
  onChange,
}: {
  label: string
  story: JSONContent
  onChange: (story: JSONContent) => void
}) {
  const [, setRevision] = useState(0)
  const editor = useEditor({
    extensions: v6Extensions,
    content: story,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: 'v6-story-editor min-h-12 rounded border p-2 outline-none',
        'aria-label': label,
      },
    },
    onUpdate: ({ editor }) => onChange(normalizeV6Story(editor.getJSON())),
    onSelectionUpdate: () => setRevision((value) => value + 1),
  })
  if (!editor)
    return (
      <p role="status" className="p-2 text-xs text-muted-foreground">
        Loading {label.toLowerCase()}…
      </p>
    )
  const action = (name: string, active: boolean, run: () => void) => (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
    >
      {name}
    </Button>
  )
  return (
    <div className="mt-2 grid gap-2" role="group" aria-label={`${label} editor`}>
      <div className="flex flex-wrap gap-1" role="toolbar" aria-label={`${label} formatting`}>
        <AppSelect
          label={`${label} paragraph style`}
          className="h-8 w-36"
          value={editor.getAttributes('paragraph').style || 'Normal'}
          options={V6_STYLE_NAMES.map((name) => ({ value: name, label: name }))}
          onValueChange={(value) =>
            editor.chain().focus().updateAttributes('paragraph', { style: value }).run()
          }
        />
        {action('Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
        {action('Italic', editor.isActive('italic'), () =>
          editor.chain().focus().toggleItalic().run(),
        )}
        {action('Underline', editor.isActive('underline'), () =>
          editor.chain().focus().toggleUnderline().run(),
        )}
        {action('Strikethrough', editor.isActive('strike'), () =>
          editor.chain().focus().toggleStrike().run(),
        )}
        {action('Page number', false, () =>
          editor.chain().focus().insertContent({ type: 'pageNumber' }).run(),
        )}
        {action('Page count', false, () =>
          editor.chain().focus().insertContent({ type: 'pageCount' }).run(),
        )}
        {action('Line break', false, () => editor.chain().focus().setHardBreak().run())}
        {action('Rule', false, () =>
          editor
            .chain()
            .focus()
            .insertContent({ type: 'horizontalRule', attrs: { id: nodeID() } })
            .run(),
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

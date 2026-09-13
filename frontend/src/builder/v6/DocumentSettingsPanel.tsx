import type { JSONContent } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { HeaderFooterEditor } from './HeaderFooterEditor'
import type { V6Settings, V6StoryKey } from './model'
import { BoundedNumberInput } from './BoundedNumberInput'

export function DocumentSettingsPanel({
  open,
  settings,
  stories,
  pageCount,
  pageMapFailed,
  onOpenChange,
  onSettingsChange,
  onStoryChange,
  tab,
  onTabChange,
}: {
  open: boolean
  settings: V6Settings
  stories: Record<V6StoryKey, JSONContent>
  pageCount: number
  pageMapFailed: boolean
  onOpenChange: (open: boolean) => void
  onSettingsChange: (settings: V6Settings) => void
  onStoryChange: (key: V6StoryKey, story: JSONContent) => void
  tab: 'document' | 'stories'
  onTabChange: (tab: 'document' | 'stories') => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-[28rem] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-[28rem]"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById('v6-document-settings-trigger')?.focus()
        }}
      >
        <SheetHeader>
          <SheetTitle>Document settings</SheetTitle>
          <SheetDescription>Page geometry and repeating page content.</SheetDescription>
        </SheetHeader>
        <div
          className="mt-5 grid grid-cols-2 rounded-lg bg-muted p-1"
          role="tablist"
          aria-label="Document settings sections"
        >
          <Button
            type="button"
            size="sm"
            variant={tab === 'document' ? 'secondary' : 'ghost'}
            role="tab"
            aria-selected={tab === 'document'}
            onClick={() => onTabChange('document')}
          >
            Document
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === 'stories' ? 'secondary' : 'ghost'}
            role="tab"
            aria-selected={tab === 'stories'}
            onClick={() => onTabChange('stories')}
          >
            Headers &amp; footers
          </Button>
        </div>
        {tab === 'document' ? (
          <div className="mt-5 grid gap-5" role="tabpanel">
            <label className="grid gap-2 text-sm">
              Page format
              <Input value="A4" readOnly aria-readonly="true" />
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Orientation</legend>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={settings.orientation === 'portrait' ? 'secondary' : 'outline'}
                  onClick={() => onSettingsChange({ ...settings, orientation: 'portrait' })}
                >
                  Portrait
                </Button>
                <Button
                  type="button"
                  variant={settings.orientation === 'landscape' ? 'secondary' : 'outline'}
                  onClick={() => onSettingsChange({ ...settings, orientation: 'landscape' })}
                >
                  Landscape
                </Button>
              </div>
            </fieldset>
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="col-span-2 text-sm font-medium">Margins (mm)</legend>
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <label key={side} className="grid gap-1 text-xs capitalize">
                  {side}
                  <BoundedNumberInput
                    label={`${side} margin in millimetres`}
                    min={5}
                    max={80}
                    value={Math.round(settings.margins[side] / 283.465)}
                    onCommit={(value) =>
                      onSettingsChange({
                        ...settings,
                        margins: {
                          ...settings.margins,
                          [side]: Math.round(value * 283.465),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
            <p
              role="status"
              className={
                pageMapFailed ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
              }
            >
              {pageMapFailed
                ? 'Page layout unavailable — retrying'
                : `${pageCount} page${pageCount === 1 ? '' : 's'} · PDF-authoritative layout`}
            </p>
          </div>
        ) : (
          <div className="mt-5" role="tabpanel">
            <HeaderFooterEditor
              embedded
              stories={stories}
              differentFirstPage={Boolean(settings.different_first_page)}
              onStoryChange={onStoryChange}
              onDifferentFirstPageChange={(different_first_page) =>
                onSettingsChange({ ...settings, different_first_page })
              }
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

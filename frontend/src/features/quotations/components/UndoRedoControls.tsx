import { Undo, Redo } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UndoRedoControls({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  return (
    <div className="mr-1 flex shrink-0 items-center gap-1 border-r pr-1 sm:mr-2 sm:pr-2">
      <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">
        <Undo className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)">
        <Redo className="w-4 h-4" />
      </Button>
    </div>
  )
}

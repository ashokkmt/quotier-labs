import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut'
import { useToast } from '@/hooks/use-toast'

export function ShortcutManager() {
  const { toast } = useToast()

  useKeyboardShortcut({ key: 's', metaKey: true }, () => {
    toast({
      title: 'Save Triggered',
      description: 'Keyboard shortcut ⌘/Ctrl+S activated',
    })
  })

  useKeyboardShortcut({ key: 'z', metaKey: true }, () => {
    toast({
      title: 'Undo Triggered',
      description: 'Keyboard shortcut ⌘/Ctrl+Z activated',
    })
  })

  useKeyboardShortcut({ key: 'z', metaKey: true, shiftKey: true }, () => {
    toast({
      title: 'Redo Triggered',
      description: 'Keyboard shortcut ⌘/Ctrl+Shift+Z activated',
    })
  })

  return null
}

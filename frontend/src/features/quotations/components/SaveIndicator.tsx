import type { SaveState } from "../hooks/useAutosave"
import { Loader2, CheckCircle2, AlertCircle, Save } from "lucide-react"

export function SaveIndicator({ state, lastSaved }: { state: SaveState, lastSaved: Date }) {
  if (state === 'Saving...') {
    return <div className="flex items-center text-xs text-muted-foreground"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</div>
  }
  if (state === 'Save failed - retrying') {
    return <div className="flex items-center text-xs text-destructive"><AlertCircle className="w-3 h-3 mr-1" /> Retrying save...</div>
  }
  if (state === 'Unsaved changes') {
    return <div className="flex items-center text-xs text-amber-500"><Save className="w-3 h-3 mr-1" /> Unsaved changes</div>
  }
  
  return <div className="flex items-center text-xs text-muted-foreground"><CheckCircle2 className="w-3 h-3 mr-1 text-green-500" /> Saved {lastSaved.toLocaleTimeString()}</div>
}

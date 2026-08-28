import { blockLibrary, createLibraryBlock, type LibraryEntry } from "../model/library"
import { Button } from "@/components/ui/button"
export function BlockLibraryPanel({ onAdd }: { onAdd: (entry: LibraryEntry) => void }) { return <aside className="w-56 shrink-0 border-r pr-3 space-y-2" aria-label="Block library"><h2 className="font-semibold">Block Library</h2>{blockLibrary.map(entry => <Button key={entry.label} variant="outline" className="w-full justify-start" draggable onDragStart={e => e.dataTransfer.setData("application/x-block", entry.label)} onClick={() => onAdd(entry)}>{entry.label}</Button>)}</aside> }
export { createLibraryBlock }

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Copy, GripVertical } from "lucide-react"
import { FieldInput } from "./FieldInput"
import { TableEditor } from "./TableEditor"
import { BlockLibraryPanel, createLibraryBlock } from "./components/BlockLibraryPanel"
import { blockLibrary } from "./model/library"
import { canContain, validateChildren, type Block, type DocumentModel } from "./model/block"
import type { LibraryEntry } from "./model/library"

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function insert(children: Block[], parentId: string | null, block: Block): Block[] {
  if (!parentId) return [...children, block]
  return children.map(parent => parent.id === parentId ? { ...parent, children: [...parent.children, block] } : { ...parent, children: insert(parent.children, parentId, block) })
}
function remove(children: Block[], id: string): [Block[], Block | null] {
  for (let i = 0; i < children.length; i++) { if (children[i].id === id) return [[...children.slice(0, i), ...children.slice(i + 1)], children[i]]; const [nested, found] = remove(children[i].children, id); if (found) return [children.map((b, n) => n === i ? { ...b, children: nested } : b), found] }
  return [children, null]
}
function find(children: Block[], id: string): Block | null { for (const b of children) { if (b.id === id) return b; const found = find(b.children, id); if (found) return found } return null }
function move(children: Block[], sourceId: string, targetId: string): Block[] | null { if (sourceId === targetId || find(find(children, sourceId)?.children ?? [], targetId)) return null; const [without, source] = remove(children, sourceId); if (!source) return null; const target = find(without, targetId); if (!target || !canContain(target.kind, source.kind)) return null; return insert(without, targetId, source) }

export function DocumentCanvas({ document, onChange, readOnly }: { document: DocumentModel; onChange: (document: DocumentModel) => void; readOnly: boolean }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [dropError, setDropError] = useState("")
  const add = (entry: LibraryEntry, parentId: string | null = null) => { const block = createLibraryBlock(entry); const parent = parentId ? find(document.children, parentId) : null; if (parent && !canContain(parent.kind, block.kind)) return; if (!parent && !canContain("root", block.kind)) return; onChange({ ...document, children: insert(document.children, parentId, block) }); setSelected(block.id) }
  const change = (id: string, update: (block: Block) => Block) => onChange({ ...document, children: document.children.map(b => updateTree(b, id, update)) })
  const updateTree = (block: Block, id: string, update: (block: Block) => Block): Block => block.id === id ? update(block) : { ...block, children: block.children.map(child => updateTree(child, id, update)) }
  const deleteBlock = (id: string) => { const [children] = remove(document.children, id); onChange({ ...document, children }); setSelected(null) }
  const duplicate = (id: string) => { const source = find(document.children, id); if (!source) return; const clone = (b: Block): Block => ({ ...copy(b), id: crypto.randomUUID(), children: b.children.map(clone) }); const [children] = remove(document.children, id); onChange({ ...document, children: insert(children, null, clone(source)) }) }
  if (!document) return null
  const reparent = (sourceId: string, targetId: string | null) => { let children: Block[] | null; if (!targetId) { const [remaining, source] = remove(document.children, sourceId); children = source && canContain("root", source.kind) ? [...remaining, source] : null } else children = move(document.children, sourceId, targetId); if (!children) { setDropError("That block cannot be placed there."); return } const reason = validateChildren(children); if (reason) { setDropError(reason); return } setDropError(""); onChange({ ...document, children }) }
  return <div className="flex gap-5 max-w-7xl mx-auto">
    {!readOnly && <BlockLibraryPanel onAdd={entry => add(entry)} />}
    <main className="flex-1 space-y-4 min-h-[700px]" onDragOver={e => e.preventDefault()} onDrop={e => { const existing = e.dataTransfer.getData("application/x-existing-block"); if (existing) { reparent(existing, null); return } const label = e.dataTransfer.getData("application/x-block"); const entry = (requireLibrary(label)); if (entry) add(entry) }}>
      {dropError && <p role="alert" className="text-sm text-destructive">{dropError}</p>}
      {document.children.length === 0 && <div className="p-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">Empty document. Add a block from the library.</div>}
      {document.children.map(block => <BlockView key={block.id} block={block} selected={selected} readOnly={readOnly} onSelect={setSelected} onDelete={deleteBlock} onDuplicate={duplicate} onChange={change} onAdd={add} onMove={reparent} />)}
    </main>
  </div>
}
function requireLibrary(label: string): LibraryEntry | undefined { return blockLibrary.find(entry => entry.label === label) }

function BlockView({ block, selected, readOnly, onSelect, onDelete, onDuplicate, onChange, onAdd, onMove }: any) {
  return <section draggable={!readOnly} className={`border rounded-lg p-4 space-y-3 ${selected === block.id ? "ring-2 ring-primary" : ""}`} onClick={() => onSelect(block.id)} onDragStart={e => e.dataTransfer.setData("application/x-existing-block", block.id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); const id = e.dataTransfer.getData("application/x-existing-block"); if (id) onMove(id, block.id); else { const entry = requireLibrary(e.dataTransfer.getData("application/x-block")); if (entry) onAdd(entry, block.id) } }}>
    <header className="flex items-center gap-2"><GripVertical className="w-4 h-4 text-muted-foreground" /><strong>{block.title || `${block.kind} block`}</strong><span className="text-xs text-muted-foreground">{block.kind}</span>{!readOnly && <span className="ml-auto flex gap-1"><Button variant="ghost" size="icon" aria-label="Duplicate block" onClick={e => { e.stopPropagation(); onDuplicate(block.id) }}><Copy /></Button><Button variant="ghost" size="icon" aria-label="Delete block" onClick={e => { e.stopPropagation(); onDelete(block.id) }}><Trash2 /></Button></span>}</header>
    {block.kind === "section" && <div className="space-y-3">{!readOnly && selected === block.id && <Input aria-label="Section title" value={block.title ?? ""} onChange={e => onChange(block.id, (b: Block) => ({ ...b, title: e.target.value }))} />}{(block.fields ?? []).map((field: any, i: number) => <label key={field.id} className="block space-y-1"><span className="text-xs font-semibold">{field.label}</span><div className="flex gap-2"><Input value={field.label} readOnly={readOnly} aria-label={`${field.label} label`} onChange={e => onChange(block.id, (b: Block) => ({ ...b, fields: b.fields?.map((f, n) => n === i ? { ...f, label: e.target.value } : f) }))} /><FieldInput field={field} value={field.value} readOnly={readOnly} onChange={(value: unknown) => onChange(block.id, (b: Block) => ({ ...b, fields: b.fields?.map((f, n) => n === i ? { ...f, value } : f) }))} /></div></label>)}{!readOnly && selected === block.id && <Button variant="outline" size="sm" onClick={() => onChange(block.id, (b: Block) => ({ ...b, fields: [...(b.fields ?? []), { id: crypto.randomUUID(), label: "New field", type: "Text", required: false }] }))}><Plus className="w-3 h-3 mr-1" /> Add field</Button>}{(block.tables ?? []).map((table: any) => <TableEditor key={table.id} tableDef={table} rows={table.rows ?? []} readOnly={readOnly} onChange={(rows: any[]) => onChange(block.id, (b: Block) => ({ ...b, tables: b.tables?.map(t => t.id === table.id ? { ...t, rows } : t) }))} />)}</div>}
    {block.children.map((child: Block) => <BlockView key={child.id} block={child} selected={selected} readOnly={readOnly} onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} onChange={onChange} onAdd={onAdd} onMove={onMove} />)}
    {!readOnly && block.kind !== "row" && <Button variant="outline" size="sm" onClick={() => onAdd({ label: "Section", blockKind: "section" }, block.id)}><Plus className="w-3 h-3 mr-1" /> Add section</Button>}
  </section>
}

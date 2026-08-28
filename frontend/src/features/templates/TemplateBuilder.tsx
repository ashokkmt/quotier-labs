import { useEffect, useState } from "react"
import { Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { GetTemplate, UpdateTemplate } from "../../../wailsjs/go/wails/TemplateHandler"
import { DocumentCanvas } from "../quotations/DocumentCanvas"
import type { DocumentModel, Block } from "../quotations/model/block"

function normalize(value: any): DocumentModel { if (Array.isArray(value?.children)) return { schema_version: value.schema_version ?? 1, children: value.children }; const children: Block[] = (value?.rows ?? []).map((row: any) => ({ id: row.id, kind: "row", visible: true, optional: false, children: (row.columns ?? []).map((col: any) => ({ id: col.id, kind: "column", width: col.width === "100%" ? "100%" : col.width === "50%" ? "50%" : col.width === "33%" ? "33%" : "66%", visible: true, optional: false, children: (col.sections ?? []).map((s: any) => ({ id: s.id, kind: "section", title: s.title_override, visible: s.visibility !== false, optional: !!s.optional, children: [], section_definition_id: s.section_definition_id, fields: [], tables: [] })) })) })); return { schema_version: 1, children } }

export function TemplateBuilder({ templateId, onBack }: { templateId: string, onBack: () => void }) {
  const [document, setDocument] = useState<DocumentModel>({ schema_version: 1, children: [] }); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const { toast } = useToast()
  useEffect(() => { GetTemplate(templateId).then(res => { setName(res.name); setDescription(res.description || ""); setDocument(normalize(res.layout ? JSON.parse(res.layout) : {})) }).catch(err => toast({ title: "Failed to load template", description: String(err), variant: "destructive" })).finally(() => setLoading(false)) }, [templateId])
  const save = async () => { setSaving(true); try { await UpdateTemplate({ id: templateId, name, description, layout: JSON.stringify(document) }); toast({ title: "Template saved" }) } catch (err) { toast({ title: "Failed to save", description: String(err), variant: "destructive" }) } finally { setSaving(false) } }
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>
  return <div className="h-full flex flex-col"><header className="flex items-center gap-3 p-3 border-b"><Input aria-label="Template name" value={name} onChange={e => setName(e.target.value)} className="max-w-sm font-semibold" /><Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" /> Save</Button><Button variant="ghost" onClick={onBack}>Close</Button></header><div className="flex-1 overflow-auto p-5"><DocumentCanvas document={document} readOnly={false} onChange={setDocument} /></div></div>
}

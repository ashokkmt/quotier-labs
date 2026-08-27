import { FieldInput } from "./FieldInput"
import { TableEditor } from "./TableEditor"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Columns2 } from "lucide-react"
import { ListSectionDefinitions } from "../../../wailsjs/go/wails/SectionHandler"

export function DocumentCanvas({ document, onChange, readOnly }: any) {
  const [definitions, setDefinitions] = useState<any[]>([])
  useEffect(() => { if (!readOnly) ListSectionDefinitions().then(setDefinitions).catch(() => setDefinitions([])) }, [readOnly])
  if (!document) return null
  const clone = () => JSON.parse(JSON.stringify(document))
  const addRow = () => { const d = clone(); d.rows.push({ id:`row_${Date.now()}`, order:d.rows.length, columns:[{ id:`col_${Date.now()}`, order:0, width:"100%", sections:[] }] }); onChange(d) }
  const addSection = (rIndex:number, cIndex:number) => { const def = definitions[0]; if (!def) return; const d=clone(); d.rows[rIndex].columns[cIndex].sections.push({ id:`section_${Date.now()}`, section_definition_id:def.id, title:def.name, visibility:true, optional:false, fields:[], tables:[] }); onChange(d) }
  if (document.rows.length === 0) return <div className="space-y-4"><div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">Empty Document</div>{!readOnly && <Button onClick={addRow}><Plus className="w-4 h-4 mr-2" /> Add Row</Button>}</div>

  const updateSectionField = (rIndex: number, cIndex: number, sIndex: number, fIndex: number, value: any) => {
    const newDoc = clone()
    newDoc.rows[rIndex].columns[cIndex].sections[sIndex].fields[fIndex].value = value
    onChange(newDoc)
  }

  const updateSectionTable = (rIndex: number, cIndex: number, sIndex: number, tIndex: number, rows: any[]) => {
    const newDoc = clone()
    newDoc.rows[rIndex].columns[cIndex].sections[sIndex].tables[tIndex].rows = rows
    onChange(newDoc)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto bg-background p-8 rounded-lg shadow-sm border min-h-[800px]">
      {document.rows.map((row: any, rIndex: number) => (
        <div key={row.id} className="space-y-2">
        <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" disabled={readOnly} onClick={() => { const d=clone(); d.rows.splice(rIndex,1); onChange(d) }}><Trash2 className="w-3 h-3 mr-1" /> Remove row</Button><Button variant="outline" size="sm" disabled={readOnly} onClick={() => { const d=clone(); const cols=d.rows[rIndex].columns; cols.push({id:`col_${Date.now()}`,order:cols.length,width:cols.length===1?"50%":"33%",sections:[]}); if(cols.length===2) cols[0].width="50%"; onChange(d) }}><Columns2 className="w-3 h-3 mr-1" /> Add column</Button></div>
        <div className="flex flex-wrap md:flex-nowrap gap-6">
          {row.columns.map((col: any, cIndex: number) => (
            <div 
              key={col.id} 
              className="flex flex-col gap-6"
              style={{ width: col.width }}
            >
              {col.sections.filter((s: any) => s.visibility !== false).map((sec: any, sIndex: number) => (
                <div key={sec.id} className="space-y-4">
                  {sec.title && <h3 className="text-xl font-bold font-heading text-primary border-b pb-2">{sec.title}</h3>}
                  
              {sec.fields && sec.fields.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {sec.fields.map((f: any, fIndex: number) => (
                        <div key={f.id} className="space-y-1">
                          <label className="text-xs font-semibold text-muted-foreground uppercase">{f.label}</label>
                          <FieldInput 
                            field={f} 
                            value={f.value} 
                            readOnly={readOnly}
                            onChange={(val: any) => updateSectionField(rIndex, cIndex, sIndex, fIndex, val)} 
                          />
                        </div>
                      ))}
                    </div>
                  )}

              {sec.tables && sec.tables.length > 0 && (
                    <div className="space-y-4 pt-2">
                      {sec.tables.map((t: any, tIndex: number) => (
                        <div key={t.id}>
                          {t.name && <h4 className="font-semibold mb-2">{t.name}</h4>}
                          <TableEditor 
                            tableDef={t} 
                            rows={t.rows || []} 
                            readOnly={readOnly}
                            onChange={(rows: any[]) => updateSectionTable(rIndex, cIndex, sIndex, tIndex, rows)}
                          />
                        </div>
                      ))}
                    </div>
              )}
              {!readOnly && sec.fields?.length === 0 && sec.tables?.length === 0 && <p className="text-sm text-muted-foreground">Empty section. Configure this section in the Section Library.</p>}
            </div>
          ))}
          {!readOnly && <Button variant="outline" size="sm" onClick={() => addSection(rIndex, cIndex)} disabled={definitions.length === 0}><Plus className="w-3 h-3 mr-1" /> Add section</Button>}
          </div>
        ))}
      </div>
      {!readOnly && rIndex === document.rows.length - 1 && <Button onClick={addRow}><Plus className="w-4 h-4 mr-2" /> Add row</Button>}
      </div>
      ))}
    </div>
  )
}

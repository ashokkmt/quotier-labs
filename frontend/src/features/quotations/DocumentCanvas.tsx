import { FieldInput } from "./FieldInput"
import { TableEditor } from "./TableEditor"

export function DocumentCanvas({ document, onChange, readOnly }: any) {
  if (!document || !document.rows || document.rows.length === 0) {
    return <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">Empty Document</div>
  }

  const updateSectionField = (rIndex: number, cIndex: number, sIndex: number, fIndex: number, value: any) => {
    const newDoc = { ...document, rows: [...document.rows] }
    newDoc.rows[rIndex].columns[cIndex].sections[sIndex].fields[fIndex].value = value
    onChange(newDoc)
  }

  const updateSectionTable = (rIndex: number, cIndex: number, sIndex: number, tIndex: number, rows: any[]) => {
    const newDoc = { ...document, rows: [...document.rows] }
    newDoc.rows[rIndex].columns[cIndex].sections[sIndex].tables[tIndex].rows = rows
    onChange(newDoc)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto bg-background p-8 rounded-lg shadow-sm border min-h-[800px]">
      {document.rows.map((row: any, rIndex: number) => (
        <div key={row.id} className="flex flex-wrap md:flex-nowrap gap-6">
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
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

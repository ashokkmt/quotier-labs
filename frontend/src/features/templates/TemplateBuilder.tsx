import { useState, useEffect } from "react"
import { ArrowLeft, Save, Loader2, LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { GetTemplate, UpdateTemplate } from "../../../wailsjs/go/wails/TemplateHandler"
import { BuilderCanvas } from "./BuilderCanvas"
import type { Layout } from "./schemas/layout-schema"

export function TemplateBuilder({ templateId, onBack }: { templateId: string, onBack: () => void }) {
  const [layout, setLayout] = useState<Layout>({ rows: [] })
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const res = await GetTemplate(templateId)
        setName(res.name)
        setDescription(res.description || "")
        if (res.layout) {
          setLayout(JSON.parse(res.layout))
        }
      } catch (err: any) {
        toast({ title: "Failed to load template", description: err.toString(), variant: "destructive" })
        onBack()
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [templateId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await UpdateTemplate({
        id: templateId,
        name,
        description,
        layout: JSON.stringify(layout)
      })
      toast({ title: "Template saved successfully" })
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.toString(), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <div className="flex-1 max-w-md">
            <Input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="h-8 font-semibold text-lg border-transparent hover:border-input focus-visible:border-input"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Layout
          </Button>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Simplified Builder UI for MVP */}
        <div className="flex-1 bg-muted/20 p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center bg-card p-4 rounded-md border shadow-sm">
              <div>
                <h3 className="font-medium flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-primary" /> Builder Canvas</h3>
                <p className="text-sm text-muted-foreground mt-1">Add rows and columns, then place sections inside them.</p>
              </div>
              <Button onClick={() => {
                setLayout(prev => ({
                  rows: [...prev.rows, {
                    id: "row_" + Date.now(),
                    order: prev.rows.length,
                    columns: [{
                      id: "col_" + Date.now(),
                      order: 0,
                      width: "100%",
                      sections: []
                    }]
                  }]
                }))
              }}>Add Row</Button>
            </div>
            
            <BuilderCanvas layout={layout} onChange={setLayout} />
          </div>
        </div>
      </div>
    </div>
  )
}

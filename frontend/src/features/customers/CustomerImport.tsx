import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { SelectImportFile, PreviewImport, ImportCustomers } from "../../../wailsjs/go/wails/BackupHandler"
import { FileUp, Loader2, CheckCircle2 } from "lucide-react"

export function CustomerImport({ onComplete }: { onComplete: () => void }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState("")
  const [preview, setPreview] = useState<any>(null)
  
  const [mapping, setMapping] = useState({
    name: "Name",
    email: "Email",
    phone: "Phone",
    address: "Address",
    gstin: "GSTIN",
    pan: "PAN"
  })

  const handleSelectFile = async () => {
    try {
      const path = await SelectImportFile()
      if (path) {
        setFile(path)
        const prev = await PreviewImport(path)
        setPreview(prev)
      }
    } catch (err: any) {
      toast({ title: "Failed to read file", description: err.toString(), variant: "destructive" })
    }
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    try {
      const importedCount = await ImportCustomers(file, mapping)
      toast({ title: "Import Successful", description: `Imported ${importedCount} customers.` })
      onComplete()
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.toString(), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {!preview ? (
        <div className="text-center p-12 border-2 border-dashed rounded-lg bg-muted/20">
          <FileUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Import Customers</h3>
          <p className="text-muted-foreground mb-4">Select a CSV file to import customers.</p>
          <Button onClick={handleSelectFile}>Choose File</Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h3 className="font-semibold text-lg">Preview Data</h3>
              <p className="text-sm text-muted-foreground">
                Found {preview.total} rows ({preview.valid} valid to import)
              </p>
            </div>
            <Button variant="outline" onClick={() => setPreview(null)}>Change File</Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {Object.keys(mapping).map((field) => (
              <div key={field} className="space-y-1">
                <label className="text-sm font-medium capitalize">{field}</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={mapping[field as keyof typeof mapping]}
                  onChange={(e) => setMapping({...mapping, [field]: e.target.value})}
                >
                  <option value="">-- Ignore --</option>
                  {preview.headers.map((h: string) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="border rounded bg-muted/30 p-4">
            <h4 className="text-sm font-medium mb-3">Sample Row Data</h4>
            {preview.rows.slice(0, 1).map((r: any, i: number) => (
              <div key={i} className="text-sm font-mono bg-background border p-3 rounded">
                {Object.entries(r.data).map(([k, v]) => (
                  <div key={k}><span className="text-muted-foreground">{k}:</span> {v as string}</div>
                ))}
              </div>
            ))}
          </div>

          <Button onClick={handleImport} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Confirm Import
          </Button>
        </div>
      )}
    </div>
  )
}

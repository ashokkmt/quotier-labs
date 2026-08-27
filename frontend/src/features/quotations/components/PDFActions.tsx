import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import { GeneratePDF } from "../../../../wailsjs/go/wails/DocumentHandler"
import { useToast } from "@/hooks/use-toast"

export function PDFActions({ companyId, quotationId, status }: { companyId: string, quotationId: string, status: string }) {
  const [generating, setGenerating] = useState(false)
  const { toast } = useToast()

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const path = await GeneratePDF(companyId, quotationId)
      toast({
        title: "PDF Generated",
        description: `Saved to ${path}`,
      })
    } catch (err: any) {
      toast({
        title: "Generation Failed",
        description: err.message || "Failed to generate PDF",
        variant: "destructive"
      })
    } finally {
      setGenerating(false)
    }
  }

  // Only allow generation for finalized or beyond
  if (status === "DRAFT") return null

  return (
    <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
      {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
      Generate PDF
    </Button>
  )
}

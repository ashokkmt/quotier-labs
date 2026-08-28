import { useState, useEffect } from 'react'
import { GetQuotationPreviewPDF } from '../../../../wailsjs/go/wails/DocumentHandler'
import { Loader2 } from 'lucide-react'

interface PreviewProps {
  companyId: string
  quotationId: string
  // Trigger update when document changes
  version: number
}

export function Preview({ companyId, quotationId, version }: PreviewProps) {
  const [pdfDataUri, setPdfDataUri] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchPdf = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const base64Data = await GetQuotationPreviewPDF(companyId, quotationId)
        if (isMounted) {
          setPdfDataUri(`data:application/pdf;base64,${base64Data}`)
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to generate preview')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    // Debounce preview generation
    const timer = setTimeout(fetchPdf, 500)
    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [companyId, quotationId, version])

  if (error) {
    return (
      <div className="w-full h-full min-h-[800px] flex items-center justify-center bg-muted/20 border rounded-md">
        <div className="text-destructive text-center">
          <p className="font-semibold">Preview Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[800px] border rounded-md overflow-hidden relative bg-muted/20">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">Generating Preview...</p>
          </div>
        </div>
      )}
      {pdfDataUri && (
        <object data={pdfDataUri} type="application/pdf" className="w-full h-full min-h-[800px]">
          <p>It appears your browser does not support PDFs. Please download the PDF to view it.</p>
        </object>
      )}
    </div>
  )
}

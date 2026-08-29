import { useState, useEffect, useRef } from 'react'
import {
  GetQuotationLayoutDiagnostics,
  GetQuotationPreviewPDF,
} from '../../../../wailsjs/go/wails/DocumentHandler'
import { Loader2 } from 'lucide-react'

interface PreviewProps {
  companyId: string
  quotationId: string
  // Trigger update when document changes
  version: number
}

export function Preview({ companyId, quotationId, version }: PreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const pdfUrlRef = useRef<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<
    Array<{ code: string; nodeId: string; message: string }>
  >([])

  useEffect(() => {
    let isMounted = true
    const fetchPdf = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [base64Data, resolvedDiagnostics] = await Promise.all([
          GetQuotationPreviewPDF(companyId, quotationId),
          GetQuotationLayoutDiagnostics(companyId, quotationId),
        ])
        if (isMounted) {
          const binary = atob(base64Data)
          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
          const nextUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
          pdfUrlRef.current = nextUrl
          setPdfUrl(nextUrl)
          // Wails may deliver a null slice from Go; never trust the transport type.
          setDiagnostics(Array.isArray(resolvedDiagnostics) ? resolvedDiagnostics : [])
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

  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    },
    [],
  )

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
      {pdfUrl && (
        <iframe
          src={pdfUrl}
          title="Printable quotation preview"
          className="h-full min-h-[800px] w-full border-0 bg-white"
        />
      )}
      {diagnostics.length > 0 && (
        <div
          role="status"
          className="absolute bottom-3 left-3 right-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950"
        >
          {diagnostics.map((diagnostic) => (
            <p key={`${diagnostic.code}-${diagnostic.nodeId}`}>{diagnostic.message}</p>
          ))}
        </div>
      )}
    </div>
  )
}

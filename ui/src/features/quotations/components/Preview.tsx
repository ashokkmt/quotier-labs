import { useState, useEffect, useRef } from 'react'
import {
  GetQuotationLayoutDiagnostics,
  GetQuotationPreviewPDF,
} from '../../../../wailsjs/go/wails/DocumentHandler'
import { AlertTriangle, Loader2 } from 'lucide-react'

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
      <div className="flex h-full w-full items-center justify-center bg-muted/20 p-6">
        <div className="text-destructive text-center">
          <p className="font-semibold">Preview Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-muted/30">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">Generating Preview...</p>
          </div>
        </div>
      )}
      {diagnostics.length > 0 && (
        <div
          role="status"
          className="z-10 flex shrink-0 items-start gap-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/50 dark:bg-amber-300/15 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              {diagnostics.length} layout {diagnostics.length === 1 ? 'warning' : 'warnings'}
            </p>
            <p className="truncate">{diagnostics[0].message}</p>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 p-2 sm:p-3">
        {pdfUrl && (
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1&view=Fit`}
            title="Printable quotation preview"
            className="h-full min-h-0 w-full border-0 bg-white shadow-sm"
          />
        )}
      </div>
    </div>
  )
}

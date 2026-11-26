import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileDown, Printer, Share2, Loader2 } from 'lucide-react'
import { SavePDF, PrintPDF } from '../../../../wailsjs/go/wails/ExportHandler'
import { useToast } from '@/hooks/use-toast'

export function ExportActions({
  companyId,
  quotationId,
  status,
  compact = false,
}: {
  companyId: string
  quotationId: string
  status: string
  compact?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    setLoading(true)
    try {
      const path = await SavePDF(companyId, quotationId)
      if (path) {
        toast({ title: 'PDF Saved', description: `Saved to ${path}` })
      }
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = async () => {
    setLoading(true)
    try {
      await PrintPDF(companyId, quotationId)
    } catch (err: any) {
      toast({ title: 'Print Failed', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (status === 'DRAFT') return null

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size={compact ? 'icon' : 'sm'}
        onClick={handleSave}
        disabled={loading}
        aria-label="Save PDF"
        className={compact ? 'h-9 w-9' : undefined}
      >
        {loading ? (
          <Loader2 className={`h-4 w-4 animate-spin ${compact ? '' : 'mr-2'}`} />
        ) : (
          <FileDown className={`h-4 w-4 ${compact ? '' : 'mr-2'}`} />
        )}
        {!compact && 'Save PDF'}
      </Button>

      <Button
        variant="outline"
        size={compact ? 'icon' : 'sm'}
        onClick={handlePrint}
        disabled={loading}
        aria-label="Print PDF"
        className={compact ? 'h-9 w-9' : undefined}
      >
        <Printer className={`h-4 w-4 ${compact ? '' : 'mr-2'}`} />
        {!compact && 'Print'}
      </Button>
      <Button
        variant="outline"
        size={compact ? 'icon' : 'sm'}
        onClick={() =>
          toast({ title: 'Share', description: 'This feature has not been added yet.' })
        }
        aria-label="Share PDF (not available yet)"
        className={compact ? 'h-9 w-9 opacity-60' : 'opacity-60'}
      >
        <Share2 className={`h-4 w-4 ${compact ? '' : 'mr-2'}`} />
        {!compact && 'Share'}
      </Button>
    </div>
  )
}

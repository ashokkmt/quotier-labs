import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FileDown, Printer, Share2, Copy, ExternalLink, Loader2, MoreVertical } from 'lucide-react'
import {
  SavePDF,
  PrintPDF,
  SharePDF,
  OpenPDF,
  GenerateTempPDF,
} from '../../../../wailsjs/go/wails/ExportHandler'
import { ClipboardSetText } from '../../../../wailsjs/runtime'
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

  const handleShare = async () => {
    setLoading(true)
    try {
      await SharePDF(companyId, quotationId)
    } catch (err: any) {
      toast({ title: 'Share Failed', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = async () => {
    setLoading(true)
    try {
      await OpenPDF(companyId, quotationId)
    } catch (err: any) {
      toast({ title: 'Open Failed', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleCopyPath = async () => {
    setLoading(true)
    try {
      const path = await GenerateTempPDF(companyId, quotationId)
      if (path) {
        await ClipboardSetText(path)
        toast({ title: 'Path Copied', description: 'Temporary PDF path copied to clipboard' })
      }
    } catch (err: any) {
      toast({ title: 'Copy Failed', description: err.message, variant: 'destructive' })
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" disabled={loading} aria-label="More PDF actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-2" />
            Share / OS Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleOpen}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in Default Viewer
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyPath}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Temporary Path
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

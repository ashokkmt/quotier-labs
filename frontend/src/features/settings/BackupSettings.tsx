import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  CreateBackup,
  RestoreBackup,
  ValidateBackup,
} from '../../../wailsjs/go/wails/BackupHandler'
import { Download, Upload, ShieldCheck } from 'lucide-react'

export function BackupSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleBackup = async () => {
    setLoading(true)
    try {
      const info = await CreateBackup()
      if (info) {
        toast({ title: 'Backup Created', description: `Saved to ${info.path}` })
      }
    } catch (err: any) {
      if (err !== 'backup cancelled') {
        toast({ title: 'Backup Failed', description: err.toString(), variant: 'destructive' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async () => {
    try {
      const validation = await ValidateBackup()
      if (!validation) return

      if (!validation.is_valid) {
        toast({ title: 'Invalid Backup', description: validation.error, variant: 'destructive' })
        return
      }

      if (
        !confirm(
          `Are you sure you want to restore? This will replace all current data with data from ${validation.info?.metadata.company_name} (Backed up: ${new Date(validation.info?.metadata.created_at || '').toLocaleDateString()})`,
        )
      ) {
        return
      }

      setLoading(true)
      await RestoreBackup(validation.info!.path)
      toast({ title: 'Restore Successful', description: 'Application will now reload.' })
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      if (err !== 'restore cancelled') {
        toast({ title: 'Restore Failed', description: err.toString(), variant: 'destructive' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold font-heading tracking-tight">Data & Backup</h2>
        <p className="text-muted-foreground">
          Manage your data, create manual backups, or restore from a previous backup archive.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-2">
            <Download className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold">Create Backup</h3>
          <p className="text-sm text-muted-foreground">
            Creates a complete, verifiable ZIP archive containing your database and application
            data.
          </p>
          <Button onClick={handleBackup} disabled={loading} className="w-full">
            Backup Now
          </Button>
        </div>

        <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center text-destructive mb-2">
            <Upload className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold">Restore Data</h3>
          <p className="text-sm text-muted-foreground">
            Restore from a ZIP archive.{' '}
            <strong className="text-destructive">This replaces all current data.</strong>
          </p>
          <Button
            variant="destructive"
            onClick={handleRestore}
            disabled={loading}
            className="w-full"
          >
            Restore from File
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <h3 className="text-lg font-semibold">Export Data (CSV)</h3>
        <p className="text-sm text-muted-foreground">
          Export your data to CSV format for external use.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const res = await (window as any).go.wails.BackupHandler.ExportQuotations()
                if (res && res.success)
                  toast({ title: 'Exported', description: `Saved to ${res.path}` })
              } catch (e: any) {
                if (e !== 'cancelled')
                  toast({ title: 'Error', description: e.toString(), variant: 'destructive' })
              }
            }}
          >
            Export Quotations
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const res = await (window as any).go.wails.BackupHandler.ExportCustomers()
                if (res && res.success)
                  toast({ title: 'Exported', description: `Saved to ${res.path}` })
              } catch (e: any) {
                if (e !== 'cancelled')
                  toast({ title: 'Error', description: e.toString(), variant: 'destructive' })
              }
            }}
          >
            Export Customers
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <ShieldCheck className="w-6 h-6 text-primary mt-1" />
          <div>
            <h4 className="font-semibold">Automatic Backups</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Automatic backups are enabled and will save a copy of your database to the application
              directory every hour while the application is running.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

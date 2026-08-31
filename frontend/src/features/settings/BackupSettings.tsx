import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  CreateBackup,
  ChooseAutoBackupDirectory,
  DisableAutoBackup,
  GetAutoBackupSettings,
  RestoreBackup,
  ValidateBackup,
} from '../../../wailsjs/go/wails/BackupHandler'
import { Download, FileArchive, FolderOpen, Upload } from 'lucide-react'
import { backup } from '../../../wailsjs/go/models'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function BackupSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [restoreCandidate, setRestoreCandidate] = useState<backup.ValidationResult | null>(null)
  const [automatic, setAutomatic] = useState<backup.AutoBackupSettings | null>(null)

  useEffect(() => {
    GetAutoBackupSettings()
      .then(setAutomatic)
      .catch(() =>
        setAutomatic({ enabled: false, directory: '', last_status: '', last_backup_utc: '' }),
      )
  }, [])

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

      setRestoreCandidate(validation)
    } catch (err: any) {
      if (err !== 'restore cancelled') {
        toast({ title: 'Restore Failed', description: err.toString(), variant: 'destructive' })
      }
    } finally {
      setLoading(false)
    }
  }

  const confirmRestore = async () => {
    if (!restoreCandidate?.info?.path) return
    setLoading(true)
    try {
      await RestoreBackup(restoreCandidate.info.path)
    } catch (err: any) {
      toast({ title: 'Restore failed', description: err.toString(), variant: 'destructive' })
      setLoading(false)
      setRestoreCandidate(null)
    }
  }

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-labelledby="backup-heading"
    >
      <div className="border-b p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileArchive className="h-5 w-5" />
          </span>
          <h2 id="backup-heading" className="font-semibold">
            Data &amp; backup
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your data, create manual backups, or restore from a previous backup archive.
        </p>
      </div>

      <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-background p-4">
          <Download className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Create Backup</h3>
          <p className="text-sm text-muted-foreground">
            Creates a complete, verifiable ZIP archive containing your database and application
            data.
          </p>
          <Button onClick={handleBackup} disabled={loading} className="w-full">
            Backup Now
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border bg-background p-4">
          <Upload className="h-5 w-5 text-destructive" />
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

      <div className="space-y-4 border-t p-5 sm:p-6">
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

      <div className="space-y-3 border-t p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Automatic backup</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a verified backup every hour while Quotier Labs is running.
            </p>
          </div>
          {automatic?.enabled ? (
            <Button
              variant="outline"
              onClick={async () => {
                await DisableAutoBackup()
                setAutomatic({ ...automatic, enabled: false })
              }}
            >
              Turn off
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  setAutomatic(await ChooseAutoBackupDirectory())
                } catch (error) {
                  if (String(error) !== 'backup location selection cancelled')
                    toast({
                      title: 'Could not configure backup',
                      description: String(error),
                      variant: 'destructive',
                    })
                }
              }}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Choose folder
            </Button>
          )}
        </div>
        {automatic?.enabled && (
          <div className="space-y-2">
            <p
              className="break-all rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
              title={automatic.directory}
            >
              {automatic.directory}
            </p>
            {automatic.last_status === 'failed' && (
              <p role="status" className="text-xs text-destructive">
                Backup paused or failed—check that this folder is available and writable.
              </p>
            )}
            {automatic.last_status === 'ok' && automatic.last_backup_utc && (
              <p className="text-xs text-muted-foreground">
                Last successful backup {new Date(automatic.last_backup_utc).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t bg-muted/20 px-5 py-4 text-xs text-muted-foreground sm:px-6">
        Backups contain your database and managed images. They are not encrypted; choose a private
        location.
      </div>

      <Dialog
        open={Boolean(restoreCandidate)}
        onOpenChange={(open) => !open && !loading && setRestoreCandidate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>
              This replaces the current local database and managed images, then closes Quotier Labs
              so the restored data can be opened safely.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">{restoreCandidate?.info?.metadata.company_name}</p>
            <p className="mt-1 text-muted-foreground">
              Created{' '}
              {restoreCandidate?.info?.metadata.created_at
                ? new Date(restoreCandidate.info.metadata.created_at).toLocaleString()
                : 'on an unknown date'}
            </p>
            <p className="mt-1 text-muted-foreground">
              App version {restoreCandidate?.info?.metadata.app_version}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={loading} onClick={() => setRestoreCandidate(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={loading} onClick={confirmRestore}>
              {loading ? 'Restoring…' : 'Replace data and restart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

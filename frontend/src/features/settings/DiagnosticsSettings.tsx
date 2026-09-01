import { useEffect, useState } from 'react'
import { Activity, Archive, ChevronDown, CircleStop, Gauge, Play, ScanLine } from 'lucide-react'
import {
  CaptureDiagnosticsProfile,
  ExportDiagnosticsRecording,
  GetDiagnosticsStatus,
  OpenDiagnosticsFolder,
  StartDiagnosticsRecording,
  StopDiagnosticsRecording,
} from '../../../wailsjs/go/wails/DiagnosticsHandler'
import { diagnostics } from '../../../wailsjs/go/models'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

function bytes(value?: number) {
  if (value === undefined) return 'Unavailable'
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
function duration(value: number) {
  const seconds = Math.max(0, Math.floor(value / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function DiagnosticsSettings({ channel }: { channel?: string }) {
  const { toast } = useToast()
  const [status, setStatus] = useState<diagnostics.Status | null>(null)
  const [scenario, setScenario] = useState('manual')
  const [busy, setBusy] = useState(false)
  const [betaConsent, setBetaConsent] = useState(false)
  const [open, setOpen] = useState(channel === 'beta')

  const refresh = async () => {
    try {
      setStatus(await GetDiagnosticsStatus())
    } catch {
      /* not bound in a non-desktop browser */
    }
  }
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => window.clearInterval(timer)
  }, [])
  if (channel !== 'development' && channel !== 'beta') return null

  const start = async () => {
    setBusy(true)
    try {
      setStatus(await StartDiagnosticsRecording(scenario))
    } catch (error) {
      toast({
        title: 'Could not start recording',
        description: String(error),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }
  const stop = async () => {
    setBusy(true)
    try {
      setStatus(await StopDiagnosticsRecording())
    } catch (error) {
      toast({
        title: 'Could not stop recording',
        description: String(error),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }
  const profile = async (kind: string) => {
    setBusy(true)
    try {
      const path = await CaptureDiagnosticsProfile(kind)
      toast({ title: 'Profile saved locally', description: path })
    } catch (error) {
      toast({
        title: 'Could not capture profile',
        description: String(error),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }
  const exportLast = async () => {
    if (!status?.last_session_id) return
    try {
      const result = await ExportDiagnosticsRecording(status.last_session_id)
      if (result)
        toast({
          title: 'Recording exported',
          description: 'The ZIP stays local until you share it.',
        })
    } catch (error) {
      toast({
        title: 'Could not export recording',
        description: String(error),
        variant: 'destructive',
      })
    }
  }
  const openFolder = async () => {
    try {
      await OpenDiagnosticsFolder()
    } catch (error) {
      toast({
        title: 'Could not open diagnostics folder',
        description: String(error),
        variant: 'destructive',
      })
    }
  }
  const recording = status?.recording === true

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-labelledby="diagnostics-heading">
      <button
        type="button"
        className="flex w-full items-start gap-3 p-5 text-left sm:p-6"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Activity className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="diagnostics-heading" className="font-semibold">
            {channel === 'development' ? 'Developer diagnostics' : 'Diagnostics recording'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Local CPU, memory, operation timing, and responsiveness evidence. Nothing is uploaded
            automatically.
          </p>
        </div>
        <ChevronDown
          className={`mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-4 border-t p-5 sm:p-6">
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm"
            aria-live="polite"
          >
            <span className="font-medium">
              {recording
                ? `Recording ${duration(status?.elapsed_ms || 0)}`
                : status?.finalizing
                  ? 'Finalizing report…'
                  : 'Not recording'}
            </span>
            {recording ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={stop}>
                <CircleStop className="mr-1.5 h-4 w-4" />
                Stop and save
              </Button>
            ) : (
              <div className="flex gap-2">
                <Select value={scenario} onValueChange={setScenario}>
                  <SelectTrigger aria-label="Diagnostic scenario" className="h-8 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual check</SelectItem>
                    <SelectItem value="canvas-stress">Canvas stress</SelectItem>
                    <SelectItem value="pdf">PDF generation</SelectItem>
                    <SelectItem value="large-table">Large table</SelectItem>
                    <SelectItem value="memory-check">Memory check</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={busy || (channel === 'beta' && !betaConsent)}
                  onClick={start}
                >
                  <Play className="mr-1.5 h-4 w-4" />
                  Start recording
                </Button>
              </div>
            )}
          </div>
          {channel === 'beta' && !recording && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-xs">
              <Checkbox
                checked={betaConsent}
                onCheckedChange={(value) => setBetaConsent(value === true)}
                aria-label="Consent to local diagnostics recording"
              />
              <span>
                <span className="font-medium">Record this diagnostic session locally</span>
                <span className="mt-1 block text-muted-foreground">
                  This records bounded CPU, memory, operation timing, and responsiveness summaries
                  on this device. It does not collect quotation content or upload anything.
                </span>
              </span>
            </label>
          )}
          {recording && (
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Metric
                label="Tree CPU"
                value={
                  status?.latest?.tree.cpu_percent === undefined
                    ? 'Unavailable'
                    : `${status.latest.tree.cpu_percent.toFixed(1)}%`
                }
              />
              <Metric label="Tree memory" value={bytes(status?.latest?.tree.rss_bytes)} />
              <Metric label="Go heap" value={bytes(status?.latest?.go_live_heap_bytes)} />
              <Metric label="Goroutines" value={String(status?.latest?.goroutines ?? '—')} />
            </div>
          )}
          {status?.last_operation && (
            <p className="text-xs text-muted-foreground">
              Last recorded operation: {status.last_operation}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {channel === 'development' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!recording || busy}
                  onClick={() => profile('cpu')}
                >
                  <Gauge className="mr-1.5 h-4 w-4" />
                  30-second CPU
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!recording || busy}
                  onClick={() => profile('heap')}
                >
                  Heap snapshot
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!recording || busy}
                  onClick={() => profile('goroutine')}
                >
                  Goroutines
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!recording || busy}
                  onClick={() => profile('trace')}
                >
                  <ScanLine className="mr-1.5 h-4 w-4" />
                  5-second trace
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={!status?.last_session_id || recording}
              onClick={exportLast}
            >
              <Archive className="mr-1.5 h-4 w-4" />
              Export last recording
            </Button>
            <Button size="sm" variant="ghost" disabled={!status?.available} onClick={openFolder}>
              Open diagnostics folder
            </Button>
          </div>
          {channel === 'development' && (
            <p className="text-xs text-muted-foreground">
              Profiles can briefly slow the app. Use them only while reproducing a confirmed issue.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums">{value}</div>
    </div>
  )
}

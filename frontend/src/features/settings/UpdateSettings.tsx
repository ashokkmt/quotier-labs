import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import { BrowserOpenURL, EventsOn } from '../../../wailsjs/runtime/runtime'
import {
  CancelUpdateDownload,
  CheckForUpdates,
  DownloadUpdate,
  InstallUpdate,
  SkipUpdateVersion,
} from '../../../wailsjs/go/wails/UpdateHandler'
import {
  GetPreferences,
  ExportDiagnostics,
  RecordUpdateCheck,
  SetAutomaticUpdates,
} from '../../../wailsjs/go/wails/AppHandler'
import { update, wails } from '../../../wailsjs/go/models'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'

type ViewState =
  'idle' | 'checking' | 'current' | 'available' | 'manual' | 'downloading' | 'ready' | 'error'

export function UpdateSettings({ appInfo }: { appInfo: wails.AppInfo | null }) {
  const { toast } = useToast()
  const [state, setState] = useState<ViewState>('idle')
  const [candidate, setCandidate] = useState<update.Candidate | null>(null)
  const [message, setMessage] = useState('')
  const [automatic, setAutomatic] = useState(false)
  const [lastChecked, setLastChecked] = useState('')
  const [progress, setProgress] = useState({ percent: 0, stage: '' })

  useEffect(
    () =>
      EventsOn('update-progress', (value: { percent: number; stage: string }) =>
        setProgress(value),
      ),
    [],
  )

  const check = useCallback(
    async (quiet = false) => {
      setState('checking')
      setMessage('')
      try {
        const result = await CheckForUpdates()
        const checked = result.checked_at_utc || new Date().toISOString()
        setLastChecked(checked)
        await RecordUpdateCheck()
        if (result.status === 'available' && result.candidate) {
          setCandidate(result.candidate)
          setState('available')
        } else if (result.status === 'manual-available' && result.candidate) {
          setCandidate(result.candidate)
          setState('manual')
          setMessage(
            result.message ||
              'Download the release manually and quit Quotier Labs before running the installer.',
          )
        } else if (result.status === 'skipped' && result.candidate) {
          setCandidate(null)
          setState('idle')
          setMessage(
            `Version ${result.candidate.version} is skipped. A newer release will appear here automatically.`,
          )
        } else if (result.status === 'disabled') {
          setState('idle')
          setMessage(result.message || 'Updates are disabled for this build.')
        } else {
          setState('current')
        }
      } catch (error) {
        setState('error')
        setMessage(String(error))
        if (!quiet)
          toast({
            title: 'Could not check for updates',
            description: String(error),
            variant: 'destructive',
          })
      }
    },
    [toast],
  )

  useEffect(() => {
    GetPreferences()
      .then((preferences) => {
        setAutomatic(preferences.automatic_updates)
        setLastChecked(preferences.last_update_check_utc || '')
      })
      .catch(console.error)
  }, [])

  const download = async () => {
    setState('downloading')
    setProgress({ percent: 0, stage: 'downloading' })
    try {
      await DownloadUpdate()
      setState('ready')
    } catch (error) {
      setState('error')
      setMessage(String(error))
    }
  }

  const install = async () => {
    try {
      await InstallUpdate()
    } catch (error) {
      setState('error')
      setMessage(String(error))
    }
  }

  const exportDiagnostics = async () => {
    try {
      const path = await ExportDiagnostics()
      if (path)
        toast({
          title: 'Diagnostics exported',
          description: 'The archive contains build and capability metadata only.',
        })
    } catch (error) {
      toast({
        title: 'Could not export diagnostics',
        description: String(error),
        variant: 'destructive',
      })
    }
  }

  const size = candidate?.size ? `${(candidate.size / 1024 / 1024).toFixed(1)} MB` : ''
  const manualUpdates = appInfo?.manual_updates_enabled === true
  const disabled = !appInfo?.updates_enabled && !manualUpdates

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-labelledby="updates-heading">
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="updates-heading" className="font-semibold">
              About &amp; updates
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {manualUpdates
                ? 'Release notifications and build information.'
                : 'Signed application updates and build information.'}
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-muted/60 px-3 py-2 text-right text-sm">
          <div className="font-medium">{appInfo?.name || 'Quotier Labs'}</div>
          <div className="text-muted-foreground">
            {appInfo?.version || 'Loading…'} · {appInfo?.channel || 'development'}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {disabled ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
            <p className="font-medium">Development build — updates disabled</p>
            <p className="mt-1 text-muted-foreground">
              Development runs already use your latest project files and never replace the local
              binary.
            </p>
          </div>
        ) : (
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-4">
            <span>
              <span className="block text-sm font-medium">Automatically check for updates</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {manualUpdates
                  ? 'Checks at most once every 24 hours. Unsigned packages are downloaded and installed manually from GitHub.'
                  : 'Checks at most once every 24 hours. Downloads and installation still require your action.'}
              </span>
            </span>
            <Checkbox
              checked={automatic}
              onCheckedChange={(value) => {
                const enabled = value === true
                setAutomatic(enabled)
                SetAutomaticUpdates(enabled).catch(console.error)
              }}
              aria-label="Automatically check for updates"
            />
          </label>
        )}

        {state === 'current' && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> You’re up to date.
          </div>
        )}
        {candidate &&
          (state === 'available' ||
            state === 'manual' ||
            state === 'downloading' ||
            state === 'ready') && (
            <div className="rounded-lg border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Quotier Labs {candidate.version} is available</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {size}
                    {candidate.critical ? ' · Important security update' : ''}
                  </p>
                </div>
                {candidate.release_url && state !== 'manual' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => BrowserOpenURL(candidate.release_url)}
                  >
                    Release notes <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {candidate.release_notes && (
                <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                  {candidate.release_notes}
                </p>
              )}
              {state === 'downloading' && (
                <div className="mt-4" aria-live="polite">
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {progress.stage === 'verifying'
                        ? 'Verifying signed package…'
                        : 'Downloading…'}
                    </span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-150"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      CancelUpdateDownload()
                      setState('available')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                {state === 'manual' && candidate.release_url && (
                  <Button onClick={() => BrowserOpenURL(candidate.release_url)}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open GitHub release
                  </Button>
                )}
                {state === 'available' && (
                  <Button onClick={download}>
                    <Download className="mr-2 h-4 w-4" />
                    Download update
                  </Button>
                )}
                {(state === 'available' || state === 'manual') && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCandidate(null)
                      setState('idle')
                      setMessage('Update deferred. You can check again at any time.')
                    }}
                  >
                    Later
                  </Button>
                )}
                {state === 'available' && !candidate.critical && (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await SkipUpdateVersion()
                        setCandidate(null)
                        setState('idle')
                        setMessage(
                          `Version ${candidate.version} is skipped. A newer release will still be offered.`,
                        )
                      } catch (error) {
                        setState('error')
                        setMessage(String(error))
                      }
                    }}
                  >
                    Skip this version
                  </Button>
                )}
                {state === 'ready' && (
                  <Button onClick={install}>
                    {candidate.package === 'nsis' ? 'Restart and install' : 'Open system installer'}
                  </Button>
                )}
              </div>
            </div>
          )}

        {message && (
          <p
            className="text-sm text-muted-foreground"
            role={state === 'error' ? 'alert' : undefined}
          >
            {message}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {lastChecked
              ? `Last checked ${new Date(lastChecked).toLocaleString()}`
              : 'Not checked yet'}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={state === 'checking' || disabled}
            onClick={() => check(false)}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${state === 'checking' ? 'animate-spin' : ''}`} />
            {state === 'checking' ? 'Checking…' : 'Check for updates'}
          </Button>
        </div>
        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Support diagnostics</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Exports bounded logs and build metadata—never quotations, database, or images.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={exportDiagnostics}>
            Export diagnostics
          </Button>
        </div>
      </div>
    </section>
  )
}

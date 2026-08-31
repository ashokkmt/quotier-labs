import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ShortcutManager } from '@/components/ShortcutManager'
import { Toaster } from '@/components/ui/toaster'
import { IsFirstRun } from '../../wailsjs/go/wails/CompanyHandler'
import {
  ConsumeUpdateNotice,
  GetPreferences,
  RecordUpdateCheck,
} from '../../wailsjs/go/wails/AppHandler'
import { CheckForUpdates } from '../../wailsjs/go/wails/UpdateHandler'
import {
  DiscoverLegacyData,
  ImportLegacyData,
  SkipLegacyData,
} from '../../wailsjs/go/wails/LegacyHandler'
import { legacydata } from '../../wailsjs/go/models'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Database, Loader2, ShieldCheck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function AppLayout() {
  const { toast } = useToast()
  const [isNarrow, setIsNarrow] = useState(false)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState('')
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const [legacyCandidates, setLegacyCandidates] = useState<legacydata.Candidate[]>([])
  const [legacyChoice, setLegacyChoice] = useState('')
  const [legacyAction, setLegacyAction] = useState<'import' | 'skip' | ''>('')
  const [legacyError, setLegacyError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const focused =
    location.pathname === '/quotations/new' ||
    (location.pathname.includes('/quotations/') && location.pathname.endsWith('/edit')) ||
    (location.pathname.includes('/templates/') && location.pathname.endsWith('/edit'))

  useEffect(() => {
    const handleResize = () => {
      setIsNarrow(window.innerWidth < 1366)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    let cancelled = false
    const bootstrap = async () => {
      setLoading(true)
      setInitError('')
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const candidates = await withTimeout(DiscoverLegacyData(), 5000)
          if (cancelled) return
          if (candidates.length > 0) {
            setLegacyCandidates(candidates)
            setLegacyChoice(candidates[0].path)
            setLoading(false)
            return
          }
          const isFirst = await withTimeout(IsFirstRun(), 3000)
          if (cancelled) return
          if (isFirst) navigate('/onboarding')
          else {
            setLoading(false)
            void ConsumeUpdateNotice().then((version) => {
              if (version)
                toast({
                  title: `Updated to Quotier Labs ${version}`,
                  description: 'Your data and settings are ready.',
                })
            })
          }
          return
        } catch (err) {
          if (attempt === 3 && !cancelled) {
            setInitError(
              `Could not initialize the application. Your local data was not changed. ${String(err)}`,
            )
            setLoading(false)
          }
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
        }
      }
    }
    bootstrap()

    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)
    }
  }, [bootstrapAttempt, navigate, toast])

  const importLegacy = async () => {
    if (!legacyChoice) return
    setLegacyAction('import')
    setLegacyError('')
    try {
      await ImportLegacyData(legacyChoice)
    } catch (error) {
      setLegacyError(
        `The existing data could not be imported. Nothing was removed. ${String(error)}`,
      )
      setLegacyAction('')
    }
  }

  const skipLegacy = async () => {
    setLegacyAction('skip')
    setLegacyError('')
    try {
      await SkipLegacyData()
      setLegacyCandidates([])
      setBootstrapAttempt((value) => value + 1)
    } catch (error) {
      setLegacyError(`Your choice could not be saved. ${String(error)}`)
      setLegacyAction('')
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Preparing your workspace…
      </div>
    )
  }
  if (legacyCandidates.length > 0)
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/35 p-4 sm:p-8">
        <Card className="w-full max-w-xl shadow-lg">
          <CardHeader className="space-y-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database className="size-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl">Existing Quotier Labs data found</CardTitle>
            <CardDescription className="leading-6">
              This version stores development data in a safer project-local folder. Choose the data
              you want to carry forward. The original file will not be changed or deleted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <fieldset className="space-y-2" disabled={legacyAction !== ''}>
              <legend className="sr-only">Data to import</legend>
              {legacyCandidates.map((candidate) => (
                <label
                  key={candidate.path}
                  className={`block cursor-pointer rounded-lg border p-3 transition-colors ${
                    legacyChoice === candidate.path
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:bg-accent/60'
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      className="mt-1 accent-primary"
                      type="radio"
                      name="legacy-data"
                      value={candidate.path}
                      checked={legacyChoice === candidate.path}
                      onChange={() => setLegacyChoice(candidate.path)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {candidate.display_path}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {candidate.company_count}{' '}
                        {candidate.company_count === 1 ? 'company' : 'companies'} ·{' '}
                        {candidate.quotation_count} quotations · {formatBytes(candidate.size)} ·
                        modified {formatDate(candidate.modified_at)}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Import uses a verified database snapshot. Quotier Labs will close afterward; reopen it
              to finish any required schema migration.
            </div>
            {legacyError && (
              <p role="alert" className="text-sm text-destructive">
                {legacyError}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={skipLegacy} disabled={legacyAction !== ''}>
              {legacyAction === 'skip' && <Loader2 className="animate-spin" aria-hidden="true" />}
              Start with fresh data
            </Button>
            <Button onClick={importLegacy} disabled={!legacyChoice || legacyAction !== ''}>
              {legacyAction === 'import' && <Loader2 className="animate-spin" aria-hidden="true" />}
              Import and restart
            </Button>
          </CardFooter>
        </Card>
      </main>
    )
  if (initError)
    return (
      <div className="h-screen flex items-center justify-center p-6">
        <div className="max-w-md space-y-4">
          <h1 className="text-xl font-semibold">Quotier Labs could not start</h1>
          <p role="alert" className="text-sm text-destructive">
            {initError}
          </p>
          <div className="flex flex-wrap gap-3">
            <button className="underline" onClick={() => setBootstrapAttempt((value) => value + 1)}>
              Retry
            </button>
            <button
              className="underline"
              onClick={() => {
                setInitError('')
                setLoading(false)
                navigate('/')
              }}
            >
              Open workspace
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            If this persists, review the desktop logs.
          </p>
        </div>
      </div>
    )

  if (focused)
    return (
      <div className="h-screen w-full overflow-hidden bg-background text-foreground">
        <ShortcutManager />
        <Toaster />
        <AutomaticUpdateCheck />
        <Outlet />
      </div>
    )

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <ShortcutManager />
      <Toaster />
      <AutomaticUpdateCheck />
      <Sidebar collapsed={isNarrow} />

      <main className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-end border-b bg-card px-2 sm:h-14 sm:px-4">
          <ThemeToggle />
        </header>
        <div className="flex-1 overflow-auto p-3 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function AutomaticUpdateCheck() {
  const { toast } = useToast()
  useEffect(() => {
    let cancelled = false
    let timer = 0
    void GetPreferences()
      .then((preferences) => {
        const last = Date.parse(preferences.last_update_check_utc || '')
        const due = !Number.isFinite(last) || Date.now() - last >= 24 * 60 * 60 * 1000
        if (!preferences.automatic_updates || !due || cancelled) return
        // Small jitter keeps multiple machines from checking GitHub simultaneously.
        timer = window.setTimeout(
          () => {
            void CheckForUpdates()
              .then(async (result) => {
                await RecordUpdateCheck()
                if (!cancelled && result.status === 'available' && result.candidate) {
                  toast({
                    title: `Quotier Labs ${result.candidate.version} is available`,
                    description: 'Open Settings when you are ready to review and install it.',
                  })
                }
              })
              .catch(() => undefined)
          },
          1500 + Math.round(Math.random() * 3000),
        )
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [toast])
  return null
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? 'unknown date' : parsed.toLocaleString()
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('The desktop service did not respond in time.')),
      timeoutMs,
    )
    promise.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

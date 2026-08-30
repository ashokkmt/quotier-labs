import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ShortcutManager } from '@/components/ShortcutManager'
import { Toaster } from '@/components/ui/toaster'
import { IsFirstRun } from '../../wailsjs/go/wails/CompanyHandler'

export function AppLayout() {
  const [isNarrow, setIsNarrow] = useState(false)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState('')
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
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
          const isFirst = await withTimeout(IsFirstRun(), 3000)
          if (cancelled) return
          if (isFirst) navigate('/onboarding')
          else setLoading(false)
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
  }, [bootstrapAttempt, navigate])

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }
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
        <Outlet />
      </div>
    )

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <ShortcutManager />
      <Toaster />
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

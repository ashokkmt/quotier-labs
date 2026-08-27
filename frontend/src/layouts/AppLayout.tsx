import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ShortcutManager } from '@/components/ShortcutManager'
import { Toaster } from '@/components/ui/toaster'

export function AppLayout() {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      setIsNarrow(window.innerWidth < 1366)
    }

    // Initial check
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <ShortcutManager />
      <Toaster />
      <Sidebar collapsed={isNarrow} />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-14 border-b flex items-center justify-end px-4 shrink-0 bg-card">
          <ThemeToggle />
        </header>
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

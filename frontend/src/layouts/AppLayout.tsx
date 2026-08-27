import { useState, useEffect } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { ThemeToggle } from "@/components/ThemeToggle"
import { ShortcutManager } from "@/components/ShortcutManager"
import { Toaster } from "@/components/ui/toaster"
import { IsFirstRun } from "../../wailsjs/go/wails/CompanyHandler"

export function AppLayout() {
  const [isNarrow, setIsNarrow] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const handleResize = () => {
      setIsNarrow(window.innerWidth < 1366)
    }
    
    handleResize()
    window.addEventListener("resize", handleResize)
    
    // Check if first run
    IsFirstRun().then((isFirst: boolean) => {
      if (isFirst) {
        navigate("/onboarding")
      } else {
        setLoading(false)
      }
    }).catch((err: any) => {
      console.error("Failed to check first run:", err)
      setLoading(false)
    })

    return () => window.removeEventListener("resize", handleResize)
  }, [navigate])

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

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

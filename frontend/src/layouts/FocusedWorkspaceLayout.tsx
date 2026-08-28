import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Menu } from 'lucide-react'

export function FocusedWorkspaceLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(
    () => sessionStorage.getItem('quotier-workspace-sidebar') === 'open',
  )
  const toggle = () => {
    const next = !sidebarOpen
    setSidebarOpen(next)
    sessionStorage.setItem('quotier-workspace-sidebar', next ? 'open' : 'closed')
  }
  return (
    <div className="h-full flex flex-col">
      <header className="h-12 border-b flex items-center gap-2 px-3 bg-card">
        <Button variant="ghost" size="sm" onClick={() => navigate('/quotations')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button variant="ghost" size="sm" aria-expanded={sidebarOpen} onClick={toggle}>
          <Menu className="w-4 h-4 mr-1" /> {sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">Focused workspace</span>
      </header>
      <div className={`flex-1 overflow-auto ${sidebarOpen ? '' : ''}`}>
        <Outlet key={location.pathname} />
      </div>
    </div>
  )
}

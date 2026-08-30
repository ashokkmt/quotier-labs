import { useState, useEffect } from 'react'
import { BackupSettings } from './BackupSettings'
import { GetAppInfo } from '../../../wailsjs/go/wails/AppHandler'
import { Info, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useNavigate } from 'react-router-dom'
import { wails } from '../../../wailsjs/go/models'

export function SettingsPage() {
  const [appInfo, setAppInfo] = useState<wails.AppInfo | null>(null)
  const navigate = useNavigate()
  const [density, setDensity] = useState(
    () => localStorage.getItem('quotierlabs-density') || 'default',
  )
  const updateDensity = (value: string) => {
    setDensity(value)
    localStorage.setItem('quotierlabs-density', value)
    document.documentElement.dataset.density = value
  }

  useEffect(() => {
    GetAppInfo().then(setAppInfo).catch(console.error)
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-8 sm:space-y-12">
      <div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage application preferences, backups, and data.
        </p>
      </div>

      <BackupSettings />

      <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-xl font-semibold">Appearance</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Theme</span>
          <ThemeToggle />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>UI density</span>
          <select
            aria-label="UI density"
            value={density}
            onChange={(e) => updateDensity(e.target.value)}
            className="border rounded px-2 py-1 bg-background"
          >
            <option value="compact">Compact</option>
            <option value="default">Default</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-xl font-semibold">Company</h2>
        <p className="text-sm text-muted-foreground">
          Update the company details printed on your quotations.
        </p>
        <Button className="w-full sm:w-auto" variant="outline" onClick={() => navigate('/company')}>
          <Building2 className="w-4 h-4 mr-2" /> Open Company Profile
        </Button>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">About Quotier Labs</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Version</p>
            <p className="font-medium">{appInfo?.version || 'Loading...'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Operating System</p>
            <p className="font-medium capitalize">{appInfo?.os || 'Loading...'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">License</p>
            <p className="font-medium">MVP License</p>
          </div>
        </div>
      </div>
    </div>
  )
}

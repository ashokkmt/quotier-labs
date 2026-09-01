import { useState, useEffect } from 'react'
import { BackupSettings } from './BackupSettings'
import { GetAppInfo, GetPreferences, SetDensity } from '../../../wailsjs/go/wails/AppHandler'
import { Building2, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useNavigate } from 'react-router-dom'
import { wails } from '../../../wailsjs/go/models'
import { UpdateSettings } from './UpdateSettings'
import { DiagnosticsSettings } from './DiagnosticsSettings'

export function SettingsPage() {
  const [appInfo, setAppInfo] = useState<wails.AppInfo | null>(null)
  const navigate = useNavigate()
  const [density, setDensityState] = useState(
    () => localStorage.getItem('quotierlabs-density') || 'default',
  )
  const updateDensity = (value: string) => {
    setDensityState(value)
    localStorage.setItem('quotierlabs-density', value)
    document.documentElement.dataset.density = value
    SetDensity(value).catch(console.error)
  }

  useEffect(() => {
    GetAppInfo().then(setAppInfo).catch(console.error)
    GetPreferences()
      .then((preferences) => updateDensity(preferences.density))
      .catch(console.error)
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage application preferences, backups, and data.
        </p>
      </div>

      <section className="rounded-xl border bg-card shadow-sm" aria-labelledby="appearance-heading">
        <div className="flex gap-3 border-b p-5 sm:p-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Palette className="h-5 w-5" />
          </span>
          <div>
            <h2 id="appearance-heading" className="font-semibold">
              Appearance
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose how the application feels on this device.
            </p>
          </div>
        </div>
        <div className="divide-y px-5 sm:px-6">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">
                Light, dark, or follow the operating system.
              </p>
            </div>
            <ThemeToggle />
          </div>
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium">Interface density</p>
              <p className="text-xs text-muted-foreground">
                Adjust spacing without changing document layout.
              </p>
            </div>
            <Select value={density} onValueChange={updateDensity}>
              <SelectTrigger aria-label="Interface density" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <h2 className="font-semibold">Company profile</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Update the company details printed on your quotations.
        </p>
        <Button className="w-full sm:w-auto" variant="outline" onClick={() => navigate('/company')}>
          Open company profile
        </Button>
      </section>

      <BackupSettings />
      <UpdateSettings appInfo={appInfo} />
      <DiagnosticsSettings channel={appInfo?.channel} />
    </div>
  )
}

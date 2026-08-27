import { useState, useEffect } from "react"
import { BackupSettings } from "./BackupSettings"
import { GetAppInfo } from "../../../wailsjs/go/wails/AppHandler"
import { Info } from "lucide-react"
import { wails } from "../../../wailsjs/go/models"

export function SettingsPage() {
  const [appInfo, setAppInfo] = useState<wails.AppInfo | null>(null)

  useEffect(() => {
    GetAppInfo().then(setAppInfo).catch(console.error)
  }, [])

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-12">
      <div>
        <h1 className="text-3xl font-bold font-heading">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage application preferences, backups, and data.</p>
      </div>

      <BackupSettings />

      <div className="border rounded-lg p-6 bg-card space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">About Quotier Labs</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Version</p>
            <p className="font-medium">{appInfo?.version || "Loading..."}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Operating System</p>
            <p className="font-medium capitalize">{appInfo?.os || "Loading..."}</p>
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

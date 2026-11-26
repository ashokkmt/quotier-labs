import { useEffect, useState } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import { GetActiveCompany } from '../../../wailsjs/go/wails/CompanyHandler'
import type { company } from '../../../wailsjs/go/models'

export function Dashboard() {
  const [activeCompany, setActiveCompany] = useState<company.CompanyDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    GetActiveCompany()
      .then(setActiveCompany)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-heading font-bold sm:text-3xl">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your quotation workspace at a glance.</p>
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
        {loading ? (
          <div className="flex items-center gap-3 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading company…
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            Company details could not be loaded. Open Company settings to verify your profile.
          </p>
        ) : (
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Welcome back</p>
              <h2 className="truncate text-2xl font-semibold sm:text-3xl">
                {activeCompany?.name || 'Your company'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Create and manage professional quotations from the navigation on the left.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

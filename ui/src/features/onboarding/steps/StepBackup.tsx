export function StepBackup() {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Quotier Labs stores your data locally on your machine. We strongly recommend configuring
        regular backups of your database. (Feature coming soon - skipping for MVP)
      </p>
      <div className="bg-primary/5 p-4 rounded-md border text-sm mt-6">
        You're all set! Click Complete Setup to finish onboarding and go to your Dashboard.
      </div>
    </div>
  )
}

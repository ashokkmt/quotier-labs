interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-heading font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1">This module is under construction.</p>
      </div>
    </div>
  )
}

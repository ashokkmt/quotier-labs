import { EmptyState } from '@/components/EmptyState'
import { FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function Dashboard() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-heading font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome to Quotier Labs</p>
      </div>

      <EmptyState
        icon={<FileText className="h-12 w-12" />}
        title="No quotations yet"
        description="Create your first quotation to get started with Quotier Labs."
        actionLabel="Create Quotation"
        onAction={() => navigate('/quotations')}
      />
    </div>
  )
}

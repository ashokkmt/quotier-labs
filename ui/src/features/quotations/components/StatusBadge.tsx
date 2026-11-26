import { Badge } from '@/components/ui/badge'

export function StatusBadge({ status }: { status: string }) {
  let variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' = 'default'

  switch (status) {
    case 'DRAFT':
      variant = 'secondary'
      break
    case 'FINALIZED':
      variant = 'default'
      break
    case 'SENT':
      variant = 'outline'
      break
    case 'ACCEPTED':
      variant = 'success' // We'll add this to badge variants if needed, or use style
      break
    case 'REJECTED':
    case 'EXPIRED':
      variant = 'destructive'
      break
  }

  return (
    <Badge
      variant={variant as any}
      className={status === 'ACCEPTED' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
    >
      {status}
    </Badge>
  )
}

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'

const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; className: string }
> = {
  new:         { label: 'New',         className: 'bg-slate-100 text-slate-600 border-slate-200' },
  open:        { label: 'Open',        className: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'In Progress', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved:    { label: 'Resolved',    className: 'bg-green-50 text-green-700 border-green-200' },
  closed:      { label: 'Closed',      className: 'bg-slate-50 text-slate-400 border-slate-200' },
}

interface StatusBadgeProps {
  status: TicketStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, className: colorClass } = STATUS_CONFIG[status] ?? STATUS_CONFIG.new
  return (
    <Badge variant="outline" className={cn(colorClass, className)}>
      {label}
    </Badge>
  )
}

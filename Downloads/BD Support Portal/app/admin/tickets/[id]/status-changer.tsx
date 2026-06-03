'use client'

import { useOptimistic, useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateTicketStatus } from './actions'
import type { TicketStatus } from '@/lib/types'

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

interface StatusChangerProps {
  ticketId: string
  currentStatus: TicketStatus
}

export function StatusChanger({ ticketId, currentStatus }: StatusChangerProps) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(currentStatus)
  const [, startTransition] = useTransition()

  function handleChange(val: string | null) {
    if (!val || val === optimisticStatus) return
    startTransition(async () => {
      setOptimisticStatus(val as TicketStatus)
      await updateTicketStatus(ticketId, val)
    })
  }

  return (
    <Select value={optimisticStatus} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

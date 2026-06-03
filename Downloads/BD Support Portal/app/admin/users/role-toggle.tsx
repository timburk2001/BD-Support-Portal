'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { updateUserRole } from './actions'

interface RoleToggleProps {
  userId: string
  currentRole: 'admin' | 'client'
}

export function RoleToggle({ userId, currentRole }: RoleToggleProps) {
  const [isPending, startTransition] = useTransition()
  const nextRole = currentRole === 'admin' ? 'client' : 'admin'

  function handleToggle() {
    startTransition(async () => {
      const result = await updateUserRole(userId, nextRole)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(
          nextRole === 'admin' ? 'User promoted to admin.' : 'User demoted to client.',
        )
      }
    })
  }

  return (
    <Button
      variant={nextRole === 'admin' ? 'outline' : 'outline'}
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
    >
      {isPending
        ? '…'
        : nextRole === 'admin'
          ? 'Promote to admin'
          : 'Demote to client'}
    </Button>
  )
}

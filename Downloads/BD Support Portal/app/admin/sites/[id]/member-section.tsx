'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addSiteMember, removeSiteMember, type ActionState } from './actions'

interface Member {
  user_id: string
  profiles: { full_name: string | null; email: string } | null
}

interface MemberSectionProps {
  siteId: string
  members: Member[]
}

const initial: ActionState = {}

export function MemberSection({ siteId, members }: MemberSectionProps) {
  const boundAction = addSiteMember.bind(null, siteId)
  const [state, formAction] = useActionState(boundAction, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      toast.success('Member added.')
      formRef.current?.reset()
    }
    if (state?.error) toast.error(state.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="space-y-4">
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
            const label = profile?.full_name || profile?.email || m.user_id
            return (
              <li key={m.user_id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{label}</p>
                  {profile?.full_name && (
                    <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
                  )}
                </div>
                <form action={removeSiteMember.bind(null, siteId, m.user_id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Remove
                  </Button>
                </form>
              </li>
            )
          })}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="flex gap-2 pt-2">
        <Input
          name="email"
          type="email"
          placeholder="client@example.com"
          required
          className="h-8"
        />
        <AddButton />
      </form>
    </div>
  )
}

function AddButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Adding…' : 'Add member'}
    </Button>
  )
}

'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { replyToTicket, type ReplyState } from './actions'

interface ReplyFormProps {
  ticketId: string
  currentStatus: string
}

const initial: ReplyState = {}

export function ReplyForm({ ticketId, currentStatus }: ReplyFormProps) {
  const boundAction = replyToTicket.bind(null, ticketId, currentStatus)
  const [state, formAction] = useActionState(boundAction, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      toast.success('Reply sent.')
      formRef.current?.reset()
    }
    if (state?.error) {
      toast.error(state.error)
    }
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <Textarea
        name="body"
        placeholder="Write a reply…"
        rows={4}
        required
        className="resize-none"
      />
      <div className="flex items-center justify-between">
        {currentStatus === 'resolved' || currentStatus === 'closed' ? (
          <p className="text-xs text-muted-foreground">
            Replying will reopen this ticket.
          </p>
        ) : (
          <span />
        )}
        <SubmitButton />
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Sending…' : 'Send reply'}
    </Button>
  )
}

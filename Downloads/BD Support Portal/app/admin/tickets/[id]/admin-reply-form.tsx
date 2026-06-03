'use client'

import { useState, useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { addAdminMessage, type AdminMessageState } from './actions'

interface AdminReplyFormProps {
  ticketId: string
}

const initial: AdminMessageState = {}

export function AdminReplyForm({ ticketId }: AdminReplyFormProps) {
  const [mode, setMode] = useState<'client' | 'internal'>('client')
  const boundAction = addAdminMessage.bind(null, ticketId)
  const [state, formAction] = useActionState(boundAction, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      toast.success(mode === 'internal' ? 'Internal note added.' : 'Reply sent to client.')
      formRef.current?.reset()
    }
    if (state?.error) {
      toast.error(state.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        <button
          type="button"
          onClick={() => setMode('client')}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            mode === 'client'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Reply to client
        </button>
        <button
          type="button"
          onClick={() => setMode('internal')}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            mode === 'internal'
              ? 'bg-amber-100 text-amber-900 shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Internal note
        </button>
      </div>

      {mode === 'internal' && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Internal notes are only visible to admins — clients will never see this.
        </p>
      )}

      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="is_internal" value={mode === 'internal' ? 'true' : 'false'} />
        <Textarea
          name="body"
          placeholder={mode === 'internal' ? 'Write an internal note…' : 'Write a reply to the client…'}
          rows={4}
          required
          className={cn(
            'resize-none',
            mode === 'internal' && 'border-amber-200 bg-amber-50/50 focus-visible:border-amber-400',
          )}
        />
        <div className="flex justify-end">
          <SubmitButton mode={mode} />
        </div>
      </form>
    </div>
  )
}

function SubmitButton({ mode }: { mode: 'client' | 'internal' }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending}
      className={mode === 'internal' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
    >
      {pending
        ? 'Sending…'
        : mode === 'internal'
          ? 'Add note'
          : 'Send reply'}
    </Button>
  )
}

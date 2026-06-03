'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileUploader } from '@/components/file-uploader'
import { submitTicket, type SubmitTicketState } from './actions'

interface Site {
  id: string
  name: string
}

interface NewTicketFormProps {
  sites: Site[]
}

const initialState: SubmitTicketState = {}

export function NewTicketForm({ sites }: NewTicketFormProps) {
  const [state, formAction] = useActionState(submitTicket, initialState)

  useEffect(() => {
    if (state?.error) {
      toast.error(state.error)
    }
  }, [state])

  return (
    <form action={formAction} className="space-y-6">
      {/* Site select */}
      <div className="space-y-2">
        <Label htmlFor="site_id">Site *</Label>
        <Select name="site_id" required>
          <SelectTrigger id="site_id" className={state?.fieldErrors?.site_id ? 'border-destructive' : ''}>
            <SelectValue placeholder="Select a site" />
          </SelectTrigger>
          <SelectContent>
            {sites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state?.fieldErrors?.site_id && (
          <p className="text-xs text-destructive">{state.fieldErrors.site_id}</p>
        )}
        {sites.length === 0 && (
          <p className="text-xs text-muted-foreground">
            You are not linked to any sites. Contact your account manager.
          </p>
        )}
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          name="title"
          placeholder="Brief summary of the issue"
          maxLength={120}
          required
          className={state?.fieldErrors?.title ? 'border-destructive' : ''}
        />
        {state?.fieldErrors?.title && (
          <p className="text-xs text-destructive">{state.fieldErrors.title}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Describe the issue in detail — steps to reproduce, expected vs. actual behaviour, etc."
          rows={6}
          required
          className={state?.fieldErrors?.description ? 'border-destructive' : ''}
        />
        {state?.fieldErrors?.description && (
          <p className="text-xs text-destructive">{state.fieldErrors.description}</p>
        )}
      </div>

      {/* Attachments */}
      <div className="space-y-2">
        <Label>Attachments</Label>
        <FileUploader name="attachments" maxFiles={10} />
        {state?.fieldErrors?.attachments && (
          <p className="text-xs text-destructive">{state.fieldErrors.attachments}</p>
        )}
      </div>

      <SubmitButton disabled={sites.length === 0} />
    </form>
  )
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled} className="w-full sm:w-auto">
      {pending ? 'Submitting…' : 'Submit ticket'}
    </Button>
  )
}

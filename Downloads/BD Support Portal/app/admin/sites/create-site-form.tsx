'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSite, type SiteFormState } from './actions'

const initial: SiteFormState = {}

export function CreateSiteForm() {
  const [state, formAction] = useActionState(createSite, initial)

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Site name</Label>
          <Input id="name" name="name" placeholder="Acme Corp" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="url">URL</Label>
          <Input id="url" name="url" type="url" placeholder="https://example.com" required />
        </div>
      </div>
      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Creating…' : 'Create site'}
    </Button>
  )
}

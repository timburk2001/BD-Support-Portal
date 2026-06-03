'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateSite, type ActionState } from './actions'

interface EditSiteFormProps {
  siteId: string
  defaultName: string
  defaultUrl: string
}

const initial: ActionState = {}

export function EditSiteForm({ siteId, defaultName, defaultUrl }: EditSiteFormProps) {
  const boundAction = updateSite.bind(null, siteId)
  const [state, formAction] = useActionState(boundAction, initial)

  useEffect(() => {
    if (state?.success) toast.success('Site updated.')
    if (state?.error) toast.error(state.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="site-name">Site name</Label>
          <Input id="site-name" name="name" defaultValue={defaultName} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="site-url">URL</Label>
          <Input id="site-url" name="url" type="url" defaultValue={defaultUrl} required />
        </div>
      </div>
      <SaveButton />
    </form>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  )
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendAdminNewTicketEmail } from '@/lib/email'

export type SubmitTicketState = {
  error?: string
  fieldErrors?: Record<string, string>
}

export async function submitTicket(
  _prev: SubmitTicketState,
  formData: FormData,
): Promise<SubmitTicketState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const siteId = (formData.get('site_id') as string | null)?.trim()
  const title = (formData.get('title') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim()
  const rawFiles = formData.getAll('attachments') as File[]
  const files = rawFiles.filter((f) => f instanceof File && f.size > 0)

  // Validation
  const fieldErrors: Record<string, string> = {}
  if (!siteId) fieldErrors.site_id = 'Please select a site.'
  if (!title) fieldErrors.title = 'Title is required.'
  else if (title.length > 120) fieldErrors.title = 'Title must be 120 characters or less.'
  if (!description) fieldErrors.description = 'Description is required.'

  const oversized = files.filter((f) => f.size > 10 * 1024 * 1024)
  if (oversized.length > 0) {
    fieldErrors.attachments = `${oversized.map((f) => f.name).join(', ')} exceed${oversized.length === 1 ? 's' : ''} the 10 MB limit.`
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors }
  }

  // 1. Create the ticket
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .insert({
      site_id: siteId,
      submitted_by: user.id,
      method: 'standard',
      title,
      description,
    })
    .select('id')
    .single()

  if (ticketError || !ticket) {
    return { error: ticketError?.message ?? 'Failed to create ticket. Please try again.' }
  }

  // 2. Upload attachments
  if (files.length > 0) {
    const attachmentRows: {
      ticket_id: string
      storage_path: string
      kind: 'upload'
      mime_type: string
    }[] = []

    for (const file of files) {
      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `tickets/${ticket.id}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('ticket-attachments')
        .upload(path, file, { contentType: file.type, upsert: false })

      if (uploadError) {
        // Non-fatal: log and continue
        console.error(`Upload failed for ${file.name}:`, uploadError.message)
        continue
      }

      attachmentRows.push({
        ticket_id: ticket.id,
        storage_path: path,
        kind: 'upload',
        mime_type: file.type,
      })
    }

    if (attachmentRows.length > 0) {
      await supabase.from('ticket_attachments').insert(attachmentRows)
    }
  }

  // 3. Notify admins (fire-and-forget — do not block the redirect)
  ;(async () => {
    const { data: site } = await supabase
      .from('sites')
      .select('name')
      .eq('id', siteId!)
      .single()
    await sendAdminNewTicketEmail({
      ticketId: ticket.id,
      title: title!,
      clientName: null,
      clientEmail: user.email ?? null,
      siteName: (site as { name: string } | null)?.name ?? 'Unknown site',
      method: 'standard',
      description: description!,
      attachmentCount: files.length,
    })
  })().catch((e) => console.error('[email] admin notification failed:', e))

  revalidatePath('/tickets')
  revalidatePath('/dashboard')
  redirect(`/tickets/${ticket.id}`)
}

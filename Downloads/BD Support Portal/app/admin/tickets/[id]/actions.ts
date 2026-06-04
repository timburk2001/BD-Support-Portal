'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendClientStatusChangeEmail, sendClientStaffReplyEmail } from '@/lib/email'

export type AdminMessageState = { error?: string; success?: boolean }

interface TicketRow {
  status: string
  title: string
  submitted_by: string | null
  submitter_email: string | null
  reply_to_email: string | null
}

export async function updateTicketStatus(ticketId: string, status: string): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()

  // Fetch current row so we can check whether status actually changed
  const { data: ticket } = await admin
    .from('tickets')
    .select('status, title, submitted_by, submitter_email, reply_to_email')
    .eq('id', ticketId)
    .single()

  const row = ticket as TicketRow | null
  const statusChanged = row != null && row.status !== status

  await admin.from('tickets').update({ status }).eq('id', ticketId)
  revalidatePath(`/admin/tickets/${ticketId}`)
  revalidatePath('/admin/tickets')
  revalidatePath('/admin')

  if (statusChanged && row) {
    sendClientStatusChangeEmail({
      ticketId,
      title: row.title,
      status,
      submittedBy: row.submitted_by,
      submitterEmail: row.submitter_email,
      replyToEmail: row.reply_to_email,
    }).catch((e) => console.error('[email] status-change notification failed:', e))
  }
}

export async function addAdminMessage(
  ticketId: string,
  _prev: AdminMessageState,
  formData: FormData,
): Promise<AdminMessageState> {
  const { user } = await requireAdmin()

  const body = (formData.get('body') as string | null)?.trim()
  if (!body) return { error: 'Message body cannot be empty.' }

  const isInternal = formData.get('is_internal') === 'true'

  const admin = createAdminClient()
  const { error } = await admin.from('ticket_messages').insert({
    ticket_id: ticketId,
    author_id: user.id,
    body,
    is_internal: isInternal,
  })

  if (error) return { error: error.message }

  revalidatePath(`/admin/tickets/${ticketId}`)

  // Notify the client when it's a public reply
  if (!isInternal) {
    ;(async () => {
      const { data: ticket } = await admin
        .from('tickets')
        .select('title, submitted_by, submitter_email, reply_to_email')
        .eq('id', ticketId)
        .single()

      const t = ticket as TicketRow | null
      if (!t) return

      await sendClientStaffReplyEmail({
        ticketId,
        title: t.title,
        excerpt: body.slice(0, 300),
        submittedBy: t.submitted_by,
        submitterEmail: t.submitter_email,
        replyToEmail: t.reply_to_email,
      })
    })().catch((e) => console.error('[email] staff-reply notification failed:', e))
  }

  return { success: true }
}

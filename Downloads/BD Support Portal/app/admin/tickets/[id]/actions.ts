'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

export type AdminMessageState = { error?: string; success?: boolean }

export async function updateTicketStatus(ticketId: string, status: string): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()
  await admin.from('tickets').update({ status }).eq('id', ticketId)
  revalidatePath(`/admin/tickets/${ticketId}`)
  revalidatePath('/admin/tickets')
  revalidatePath('/admin')
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
  return { success: true }
}

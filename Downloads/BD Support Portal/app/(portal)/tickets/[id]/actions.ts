'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ReplyState = {
  error?: string
  success?: boolean
}

export async function replyToTicket(
  ticketId: string,
  currentStatus: string,
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const body = (formData.get('body') as string | null)?.trim()
  if (!body) return { error: 'Reply cannot be empty.' }

  // Insert the message — RLS enforces that the user has access to this ticket.
  // is_internal is forced false both here and in the RLS WITH CHECK policy.
  const { error: msgError } = await supabase.from('ticket_messages').insert({
    ticket_id: ticketId,
    author_id: user.id,
    body,
    is_internal: false,
  })

  if (msgError) {
    return { error: msgError.message }
  }

  // If the ticket was resolved or closed, replying reopens it.
  // Clients don't have UPDATE permission on tickets, so we use the admin client.
  // We trust this is safe because the message insert above proved access.
  if (currentStatus === 'resolved' || currentStatus === 'closed') {
    const admin = createAdminClient()
    await admin.from('tickets').update({ status: 'open' }).eq('id', ticketId)
  }

  revalidatePath(`/tickets/${ticketId}`)
  return { success: true }
}

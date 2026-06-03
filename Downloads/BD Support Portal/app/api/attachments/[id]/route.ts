import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch the attachment — RLS ensures the user has access to it.
  const { data: attachment, error } = await supabase
    .from('ticket_attachments')
    .select('storage_path')
    .eq('id', id)
    .single()

  if (error || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  // Generate a 1-hour signed URL
  const { data: signed, error: urlError } = await supabase.storage
    .from('ticket-attachments')
    .createSignedUrl(attachment.storage_path, 3600)

  if (urlError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}

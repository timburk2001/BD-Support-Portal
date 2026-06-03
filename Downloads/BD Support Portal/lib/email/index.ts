import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  adminNewTicketHtml,
  clientStatusChangeHtml,
  clientStaffReplyHtml,
} from './templates'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'support@example.com'
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

// ─── Core send wrapper ────────────────────────────────────────────────────────

async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
}): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
  })
  if (error) throw error
}

// ─── Recipient helpers ────────────────────────────────────────────────────────

async function getAdminEmails(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('email').eq('role', 'admin')
  return (data ?? []).map((r: { email: string }) => r.email).filter(Boolean)
}

async function getClientEmail(
  submittedBy: string | null,
  submitterEmail: string | null,
): Promise<string | null> {
  if (submittedBy) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('email')
      .eq('id', submittedBy)
      .single()
    return (data as { email: string } | null)?.email ?? null
  }
  return submitterEmail ?? null
}

// ─── Public trigger functions (all fire-and-forget safe) ─────────────────────

export interface NewTicketEmailOpts {
  ticketId: string
  title: string
  clientName: string | null
  clientEmail: string | null
  siteName: string
  method: string
  description: string
  attachmentCount: number
}

export async function sendAdminNewTicketEmail(opts: NewTicketEmailOpts): Promise<void> {
  const to = await getAdminEmails()
  if (to.length === 0) return

  const adminUrl = `${SITE_URL}/admin/tickets/${opts.ticketId}`
  const html = adminNewTicketHtml({ ...opts, adminUrl })

  await sendEmail({
    to,
    subject: `[Support] New ticket: ${opts.title}`,
    html,
  })
}

export interface StatusChangeEmailOpts {
  ticketId: string
  title: string
  status: string
  submittedBy: string | null
  submitterEmail: string | null
}

export async function sendClientStatusChangeEmail(opts: StatusChangeEmailOpts): Promise<void> {
  const to = await getClientEmail(opts.submittedBy, opts.submitterEmail)
  if (!to) return

  const ticketUrl = `${SITE_URL}/tickets/${opts.ticketId}`
  const statusLabel = opts.status.replace('_', ' ')
  const html = clientStatusChangeHtml({ title: opts.title, status: opts.status, ticketUrl })

  await sendEmail({
    to,
    subject: `[Support] Your ticket '${opts.title}' is now ${statusLabel}`,
    html,
  })
}

export interface StaffReplyEmailOpts {
  ticketId: string
  title: string
  excerpt: string
  submittedBy: string | null
  submitterEmail: string | null
}

export async function sendClientStaffReplyEmail(opts: StaffReplyEmailOpts): Promise<void> {
  const to = await getClientEmail(opts.submittedBy, opts.submitterEmail)
  if (!to) return

  const ticketUrl = `${SITE_URL}/tickets/${opts.ticketId}`
  const html = clientStaffReplyHtml({ title: opts.title, excerpt: opts.excerpt, ticketUrl })

  await sendEmail({
    to,
    subject: `[Support] New reply on '${opts.title}'`,
    html,
  })
}

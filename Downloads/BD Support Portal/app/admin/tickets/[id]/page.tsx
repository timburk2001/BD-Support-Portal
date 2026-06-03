import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Badge } from '@/components/ui/badge'
import { TicketAttachmentGrid } from '@/components/ticket-attachment-grid'
import { StatusChanger } from './status-changer'
import { AdminReplyForm } from './admin-reply-form'
import { formatDate, relativeDate } from '@/lib/format'
import type { TicketStatus, TicketAttachment } from '@/lib/types'

interface PageProps {
  params: Promise<{ id: string }>
}

function pick<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

interface MessageWithProfile {
  id: string
  ticket_id: string
  author_id: string | null
  body: string
  is_internal: boolean
  created_at: string
  profiles: { full_name: string | null; role: string; email: string } | null
}

export default async function AdminTicketDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: ticket, error } = await supabase
    .from('tickets')
    .select('*, sites(name, url), profiles!submitted_by(full_name, email)')
    .eq('id', id)
    .single()

  if (error || !ticket) notFound()

  const [{ data: attachments }, { data: messages }] = await Promise.all([
    supabase
      .from('ticket_attachments')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('ticket_messages')
      .select('*, profiles(full_name, role, email)')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
  ])

  const attachmentsWithUrls = await Promise.all(
    (attachments ?? []).map(async (att: TicketAttachment) => {
      const { data } = await supabase.storage
        .from('ticket-attachments')
        .createSignedUrl(att.storage_path, 3600)
      return { ...att, signedUrl: data?.signedUrl ?? null }
    }),
  )

  const site = pick(ticket.sites) as { name: string; url: string } | null
  const submitter = pick(ticket.profiles) as { full_name: string | null; email: string } | null
  const typedMessages = (messages ?? []) as MessageWithProfile[]

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="min-w-0 flex-1 text-2xl font-semibold text-foreground">
            {ticket.title}
          </h1>
          <div className="flex items-center gap-2">
            <StatusBadge status={ticket.status as TicketStatus} />
            <StatusChanger ticketId={id} currentStatus={ticket.status as TicketStatus} />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {site && <span className="font-medium text-foreground">{site.name}</span>}
          <span>Opened {formatDate(ticket.created_at)}</span>
          <span className="capitalize">{ticket.method} submission</span>
        </div>
      </div>

      {/* Submitter info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Submitted by</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{submitter?.full_name || '—'}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>
              {submitter?.email || ticket.submitter_email ? (
                <a
                  href={`mailto:${submitter?.email || ticket.submitter_email}`}
                  className="text-foreground hover:underline"
                >
                  {submitter?.email || ticket.submitter_email}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        </CardContent>
      </Card>

      {/* Details */}
      {(ticket.page_url || ticket.browser || ticket.device || ticket.viewport) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
              {ticket.page_url && (
                <>
                  <dt className="text-muted-foreground">Page</dt>
                  <dd>
                    <a
                      href={ticket.page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all hover:underline"
                    >
                      {ticket.page_url}
                    </a>
                  </dd>
                </>
              )}
              {ticket.browser && (
                <>
                  <dt className="text-muted-foreground">Browser</dt>
                  <dd>{ticket.browser}</dd>
                </>
              )}
              {ticket.device && (
                <>
                  <dt className="text-muted-foreground">Device</dt>
                  <dd>{ticket.device}</dd>
                </>
              )}
              {ticket.viewport && (
                <>
                  <dt className="text-muted-foreground">Viewport</dt>
                  <dd>{ticket.viewport}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      {attachmentsWithUrls.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Attachments ({attachmentsWithUrls.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TicketAttachmentGrid attachments={attachmentsWithUrls} />
          </CardContent>
        </Card>
      )}

      {/* Conversation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {typedMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="space-y-3">
              {typedMessages.map((msg) => {
                const profile = pick(msg.profiles) as {
                  full_name: string | null
                  role: string
                  email: string
                } | null
                const authorName =
                  profile?.full_name || profile?.email || 'Unknown'
                const isAdmin = profile?.role === 'admin'

                return (
                  <li
                    key={msg.id}
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      msg.is_internal
                        ? 'border-amber-200 bg-amber-50'
                        : isAdmin
                          ? 'border-primary/20 bg-primary/5'
                          : 'border-border bg-muted/30'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{authorName}</span>
                      {isAdmin && !msg.is_internal && (
                        <Badge variant="outline" className="text-[10px] py-0 h-4">
                          Admin
                        </Badge>
                      )}
                      {msg.is_internal && (
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 h-4 border-amber-300 bg-amber-100 text-amber-800"
                        >
                          Internal
                        </Badge>
                      )}
                      <time
                        className="ml-auto text-xs text-muted-foreground"
                        title={formatDate(msg.created_at)}
                      >
                        {relativeDate(msg.created_at)}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground">{msg.body}</p>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="border-t border-border pt-5">
            <AdminReplyForm ticketId={id} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { TicketAttachmentGrid } from '@/components/ticket-attachment-grid'
import { ReplyForm } from './reply-form'
import { formatDate, relativeDate } from '@/lib/format'
import type { TicketStatus, TicketAttachment } from '@/lib/types'

interface PageProps {
  params: Promise<{ id: string }>
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

export default async function TicketDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch ticket (RLS enforces access)
  const { data: ticket, error } = await supabase
    .from('tickets')
    .select('*, sites(name, url)')
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
      .eq('is_internal', false)
      .order('created_at', { ascending: true }),
  ])

  // Generate signed URLs for all attachments (1 hour expiry)
  const attachmentsWithUrls = await Promise.all(
    (attachments ?? []).map(async (att: TicketAttachment) => {
      const { data } = await supabase.storage
        .from('ticket-attachments')
        .createSignedUrl(att.storage_path, 3600)
      return { ...att, signedUrl: data?.signedUrl ?? null }
    }),
  )

  // Supabase returns joined rows as arrays or objects; normalise to object
  const rawSite = ticket.sites
  const site = (Array.isArray(rawSite) ? rawSite[0] : rawSite) as
    | { name: string; url: string }
    | null
    | undefined

  const isClosed = ticket.status === 'resolved' || ticket.status === 'closed'
  const typedMessages = (messages ?? []) as MessageWithProfile[]

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-foreground flex-1 min-w-0">
            {ticket.title}
          </h1>
          <StatusBadge status={ticket.status as TicketStatus} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {site && <span className="font-medium text-foreground">{site.name}</span>}
          <span>Opened {formatDate(ticket.created_at)}</span>
          <span className="capitalize">{ticket.method} submission</span>
        </div>
      </div>

      {/* Closed/resolved banner */}
      {isClosed && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          This ticket is{' '}
          <strong className="text-foreground">{ticket.status}</strong>. You can still reply —
          it will be reopened automatically.
        </div>
      )}

      {/* Description */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        </CardContent>
      </Card>

      {/* Metadata block */}
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
                      className="text-foreground hover:underline break-all"
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

      {/* Conversation thread */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {typedMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No messages yet. Send a reply below.
            </p>
          ) : (
            <ul className="space-y-5">
              {typedMessages.map((msg) => {
                const isAdmin = msg.profiles?.role === 'admin'
                const authorName = isAdmin
                  ? 'Support team'
                  : (msg.profiles?.full_name || msg.profiles?.email || 'You')
                const isOwn = msg.author_id === user?.id && !isAdmin

                return (
                  <li key={msg.id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground select-none">
                      {(authorName[0] ?? '?').toUpperCase()}
                    </div>
                    <div className={`flex flex-col gap-1 max-w-[80%] ${isOwn ? 'items-end' : ''}`}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-foreground">{authorName}</span>
                        <time
                          className="text-xs text-muted-foreground"
                          title={formatDate(msg.created_at)}
                        >
                          {relativeDate(msg.created_at)}
                        </time>
                      </div>
                      <div
                        className={`rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap
                          ${isAdmin
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                          }`}
                      >
                        {msg.body}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="border-t border-border pt-5">
            <ReplyForm ticketId={id} currentStatus={ticket.status} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import { relativeDate } from '@/lib/format'
import type { TicketStatus } from '@/lib/types'

/** Supabase returns joined rows as arrays or single objects depending on the relationship.
 *  This helper handles both safely. */
function joinedSiteName(sites: unknown): string {
  if (!sites) return '—'
  const s = Array.isArray(sites) ? sites[0] : sites
  return (s as { name?: string } | null)?.name ?? '—'
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: memberRows }, { data: tickets }] = await Promise.all([
    supabase.from('profiles').select('full_name, email').eq('id', user!.id).single(),
    supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user!.id),
    supabase
      .from('tickets')
      .select('id, title, status, created_at, sites(name)')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // Resolve site IDs to full site rows
  const siteIds = (memberRows ?? []).map((r: { site_id: string }) => r.site_id)
  const { data: linkedSites } = siteIds.length > 0
    ? await supabase.from('sites').select('id, name, url').in('id', siteIds)
    : { data: [] as { id: string; name: string; url: string }[] }

  const displayName = profile?.full_name || profile?.email || user?.email

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back{displayName ? `, ${displayName.split(' ')[0]}` : ''}.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s an overview of your support activity.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Sites card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Your sites</CardTitle>
          </CardHeader>
          <CardContent>
            {!linkedSites || linkedSites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sites linked yet. Contact your account manager.
              </p>
            ) : (
              <ul className="space-y-2">
                {linkedSites.map((site) => (
                  <li key={site.id} className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium">{site.name}</span>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors truncate"
                    >
                      {site.url.replace(/^https?:\/\//, '')}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent tickets card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-medium">Recent tickets</CardTitle>
            <Link href="/tickets" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {!tickets || tickets.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">No tickets yet.</p>
                <Link href="/tickets/new" className={cn(buttonVariants({ size: 'sm' }))}>
                  Submit a ticket
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="flex items-start justify-between gap-3 rounded-md hover:bg-muted/40 -mx-2 px-2 py-1.5 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{ticket.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {joinedSiteName(ticket.sites)}{' · '}{relativeDate(ticket.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={ticket.status as TicketStatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

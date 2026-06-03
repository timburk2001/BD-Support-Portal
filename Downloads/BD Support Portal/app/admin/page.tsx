import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { relativeDate } from '@/lib/format'
import type { TicketStatus } from '@/lib/types'

function pick<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const startOfWeek = new Date()
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const [
    { count: openCount },
    { count: newTodayCount },
    { count: resolvedWeekCount },
    { data: recentTickets },
  ] = await Promise.all([
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']),
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .gte('created_at', oneDayAgo),
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['resolved', 'closed'])
      .gte('updated_at', startOfWeek.toISOString()),
    supabase
      .from('tickets')
      .select(
        'id, title, status, created_at, submitter_email, sites(name), profiles!submitted_by(full_name, email)',
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Support activity at a glance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{openCount ?? 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">Open + in progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">New (last 24 h)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{newTodayCount ?? 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">Awaiting triage</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resolved this week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{resolvedWeekCount ?? 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">Since Sunday midnight</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-medium">Recent tickets</CardTitle>
          <Link
            href="/admin/tickets"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {!recentTickets || recentTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Title</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Client</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Site</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTickets.map((ticket) => {
                    const profile = pick(ticket.profiles) as {
                      full_name: string | null
                      email: string
                    } | null
                    const site = pick(ticket.sites) as { name: string } | null
                    const clientLabel =
                      profile?.full_name || profile?.email || ticket.submitter_email || '—'
                    return (
                      <tr
                        key={ticket.id}
                        className="border-b border-border last:border-0 hover:bg-muted/20"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/tickets/${ticket.id}`}
                            className="font-medium hover:underline"
                          >
                            {ticket.title}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{clientLabel}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {site?.name ?? '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={ticket.status as TicketStatus} />
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {relativeDate(ticket.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

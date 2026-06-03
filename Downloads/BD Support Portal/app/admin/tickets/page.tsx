import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { relativeDate } from '@/lib/format'
import { AdminFilterBar } from './admin-filter-bar'
import type { TicketStatus } from '@/lib/types'

function pick<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

const PER_PAGE = 20

interface PageProps {
  searchParams: Promise<{
    status?: string
    site?: string
    method?: string
    from?: string
    to?: string
    q?: string
    page?: string
  }>
}

export default async function AdminTicketsPage({ searchParams }: PageProps) {
  const { status, site, method, from, to, q, page: pageParam } = await searchParams
  const supabase = await createClient()

  const currentPage = Math.max(1, parseInt(pageParam ?? '1', 10))
  const from_ = (currentPage - 1) * PER_PAGE
  const to_ = from_ + PER_PAGE - 1

  const [{ data: sites }, ticketResult] = await Promise.all([
    supabase.from('sites').select('id, name').order('name'),
    (() => {
      let query = supabase
        .from('tickets')
        .select(
          'id, title, status, method, created_at, submitter_email, sites(name), profiles!submitted_by(full_name, email)',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(from_, to_)

      if (status) {
        const statuses = status.split(',').filter(Boolean)
        if (statuses.length > 0) query = query.in('status', statuses)
      }
      if (site && site !== 'all') query = query.eq('site_id', site)
      if (method && method !== 'all') query = query.eq('method', method)
      if (from) query = query.gte('created_at', from)
      if (to) query = query.lte('created_at', `${to}T23:59:59`)
      if (q) {
        query = query.or(
          `title.ilike.%${q}%,description.ilike.%${q}%,submitter_email.ilike.%${q}%`,
        )
      }

      return query
    })(),
  ])

  const { data: tickets, count } = ticketResult
  const totalPages = Math.ceil((count ?? 0) / PER_PAGE)

  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (site) params.set('site', site)
    if (method) params.set('method', method)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (q) params.set('q', q)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/admin/tickets${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">All tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {count ?? 0} ticket{count !== 1 ? 's' : ''}
          {count && totalPages > 1 ? ` · page ${currentPage} of ${totalPages}` : ''}
        </p>
      </div>

      <Suspense fallback={null}>
        <AdminFilterBar sites={sites ?? []} />
      </Suspense>

      {!tickets || tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No tickets match your filters.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => {
                  const profile = pick(ticket.profiles) as {
                    full_name: string | null
                    email: string
                  } | null
                  const site_ = pick(ticket.sites) as { name: string } | null
                  const clientLabel =
                    profile?.full_name || profile?.email || ticket.submitter_email || '—'
                  return (
                    <TableRow key={ticket.id}>
                      <TableCell>
                        <Link
                          href={`/admin/tickets/${ticket.id}`}
                          className="font-medium hover:underline"
                        >
                          {ticket.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {clientLabel}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {site_?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={ticket.status as TicketStatus} />
                      </TableCell>
                      <TableCell className="capitalize text-sm text-muted-foreground">
                        {ticket.method}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {relativeDate(ticket.created_at)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Showing {from_ + 1}–{Math.min(to_ + 1, count ?? 0)} of {count}
              </span>
              <div className="flex gap-2">
                {currentPage > 1 && (
                  <Link
                    href={pageUrl(currentPage - 1)}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    Previous
                  </Link>
                )}
                {currentPage < totalPages && (
                  <Link
                    href={pageUrl(currentPage + 1)}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

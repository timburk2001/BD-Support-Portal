import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterBar } from './filter-bar'
import { relativeDate } from '@/lib/format'
import type { TicketStatus } from '@/lib/types'

function joinedSiteName(sites: unknown): string {
  if (!sites) return '—'
  const s = Array.isArray(sites) ? sites[0] : sites
  return (s as { name?: string } | null)?.name ?? '—'
}

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string }>
}

export default async function TicketsPage({ searchParams }: PageProps) {
  const { status, q } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('tickets')
    .select('id, title, status, method, created_at, sites(name)')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  if (q) {
    query = query.ilike('title', `%${q}%`)
  }

  const { data: tickets } = await query

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tickets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tickets?.length ?? 0} ticket{tickets?.length !== 1 ? 's' : ''}
            {status && status !== 'all' ? ` · ${status.replace('_', ' ')}` : ''}
          </p>
        </div>
        <Link href="/tickets/new" className={cn(buttonVariants())}>
          New ticket
        </Link>
      </div>

      {/* Filter bar — needs Suspense because it reads useSearchParams */}
      <Suspense fallback={null}>
        <FilterBar />
      </Suspense>

      {!tickets || tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {q || (status && status !== 'all')
              ? 'No tickets match your filters.'
              : 'No tickets yet. Submit your first one.'}
          </p>
          {!q && (!status || status === 'all') && (
            <Link href="/tickets/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}>
              Submit a ticket
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Title</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell>
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="font-medium hover:underline"
                    >
                      {ticket.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {joinedSiteName(ticket.sites)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={ticket.status as TicketStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm capitalize">
                    {ticket.method}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {relativeDate(ticket.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

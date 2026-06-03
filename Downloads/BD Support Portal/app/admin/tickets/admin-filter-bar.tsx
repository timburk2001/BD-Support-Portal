'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const METHODS = [
  { value: 'visual', label: 'Visual' },
  { value: 'standard', label: 'Standard' },
]

interface AdminFilterBarProps {
  sites: { id: string; name: string }[]
}

export function AdminFilterBar({ sites }: AdminFilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const push = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value || value === 'all') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      params.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`)
      })
    },
    [router, pathname, searchParams],
  )

  const selectedStatuses = searchParams.get('status')?.split(',').filter(Boolean) ?? []

  function toggleStatus(status: string) {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status]
    push('status', next.join(','))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search title, description, email…"
          defaultValue={searchParams.get('q') ?? ''}
          onChange={(e) => push('q', e.target.value)}
          className="h-8 w-72"
        />
        <Select
          key={searchParams.get('site') ?? 'all-sites'}
          defaultValue={searchParams.get('site') ?? 'all'}
          onValueChange={(v) => push('site', v ?? 'all')}
        >
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="All sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          key={searchParams.get('method') ?? 'all-methods'}
          defaultValue={searchParams.get('method') ?? 'all'}
          onValueChange={(v) => push('method', v ?? 'all')}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="All methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          defaultValue={searchParams.get('from') ?? ''}
          onChange={(e) => push('from', e.target.value)}
          className="h-8 w-36"
          aria-label="From date"
        />
        <Input
          type="date"
          defaultValue={searchParams.get('to') ?? ''}
          onChange={(e) => push('to', e.target.value)}
          className="h-8 w-36"
          aria-label="To date"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Status:</span>
        {STATUSES.map((s) => {
          const active = selectedStatuses.includes(s.value)
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => toggleStatus(s.value)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          )
        })}
        {(selectedStatuses.length > 0 ||
          searchParams.get('q') ||
          searchParams.get('site') ||
          searchParams.get('method') ||
          searchParams.get('from') ||
          searchParams.get('to')) && (
          <button
            type="button"
            onClick={() => {
              startTransition(() => {
                router.push(pathname)
              })
            }}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}

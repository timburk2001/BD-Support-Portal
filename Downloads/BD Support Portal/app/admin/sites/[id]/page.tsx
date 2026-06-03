import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EditSiteForm } from './edit-site-form'
import { MemberSection } from './member-section'
import { ApiKeySection } from './api-key-section'

interface PageProps {
  params: Promise<{ id: string }>
}

function pick<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

export default async function AdminSiteDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: site, error } = await supabase
    .from('sites')
    .select('id, name, url')
    .eq('id', id)
    .single()

  if (error || !site) notFound()

  const [{ data: membersRaw }, { data: apiKeys }] = await Promise.all([
    supabase
      .from('site_members')
      .select('user_id, profiles(full_name, email)')
      .eq('site_id', id),
    supabase
      .from('api_keys')
      .select('id, label, created_at, last_used_at, revoked_at')
      .eq('site_id', id)
      .order('created_at', { ascending: false }),
  ])

  const members = (membersRaw ?? []).map((m) => ({
    user_id: m.user_id,
    profiles: pick(m.profiles) as { full_name: string | null; email: string } | null,
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <a href="/admin/sites" className="hover:underline">Sites</a> / {site.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{site.name}</h1>
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {site.url}
        </a>
      </div>

      {/* Edit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Site details</CardTitle>
        </CardHeader>
        <CardContent>
          <EditSiteForm siteId={id} defaultName={site.name} defaultUrl={site.url} />
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MemberSection siteId={id} members={members} />
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">API keys</CardTitle>
          <p className="text-xs text-muted-foreground">
            Used by the WordPress plugin to submit tickets. Keys are stored as SHA-256 hashes.
          </p>
        </CardHeader>
        <CardContent>
          <ApiKeySection siteId={id} apiKeys={apiKeys ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CreateSiteForm } from './create-site-form'
import { formatDate } from '@/lib/format'

export default async function AdminSitesPage() {
  const supabase = await createClient()

  const { data: sites } = await supabase
    .from('sites')
    .select('id, name, url, created_at')
    .order('name')

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sites</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {sites?.length ?? 0} site{sites?.length !== 1 ? 's' : ''} registered
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Add a new site</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateSiteForm />
        </CardContent>
      </Card>

      {sites && sites.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">All sites</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {sites.map((site) => (
                <li key={site.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{site.name}</p>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs text-muted-foreground hover:text-foreground"
                    >
                      {site.url}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      Added {formatDate(site.created_at)}
                    </span>
                    <Link
                      href={`/admin/sites/${site.id}`}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    >
                      Manage
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

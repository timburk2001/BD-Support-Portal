import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NewTicketForm } from './new-ticket-form'

export default async function NewTicketPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch membership site IDs then resolve to full site rows
  // (avoids the array vs. object inference issue from Supabase join types)
  const { data: memberRows } = await supabase
    .from('site_members')
    .select('site_id')
    .eq('user_id', user!.id)

  const siteIds = (memberRows ?? []).map((r: { site_id: string }) => r.site_id)

  const { data: sites } = siteIds.length > 0
    ? await supabase
        .from('sites')
        .select('id, name')
        .in('id', siteIds)
        .order('name')
    : { data: [] as { id: string; name: string }[] }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Submit a support ticket</CardTitle>
          <CardDescription>
            Describe the issue and we&apos;ll get back to you as soon as possible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewTicketForm sites={sites ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}

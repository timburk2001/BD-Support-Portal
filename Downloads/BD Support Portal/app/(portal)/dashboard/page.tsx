import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome, {user?.user_metadata?.full_name ?? user?.email}
        </h1>
        <p className="text-muted-foreground text-sm">
          Here&apos;s an overview of your support activity.
        </p>
      </div>
    </div>
  )
}

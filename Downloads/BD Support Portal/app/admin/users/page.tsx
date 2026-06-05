import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RoleToggle } from './role-toggle'
import { DeleteUserButton } from './delete-user-button'
import { formatDate } from '@/lib/format'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  // Must use admin client to read all profiles (self-join + is_admin() can loop)
  const [{ data: profiles }, { data: members }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false }),
    admin.from('site_members').select('user_id'),
  ])

  const siteCounts = new Map<string, number>()
  members?.forEach((m: { user_id: string }) => {
    siteCounts.set(m.user_id, (siteCounts.get(m.user_id) ?? 0) + 1)
  })

  // Get the current user so we can visually mark them
  const {
    data: { user: me },
  } = await supabase.auth.getUser()

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profiles?.length ?? 0} registered user{profiles?.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(profiles ?? []).map((profile) => {
              const isMe = profile.id === me?.id
              return (
                <TableRow key={profile.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">
                        {profile.full_name || '—'}
                        {isMe && (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{profile.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        profile.role === 'admin'
                          ? 'border-purple-200 bg-purple-50 text-purple-700 text-xs'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {profile.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {siteCounts.get(profile.id) ?? 0}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(profile.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {isMe ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <RoleToggle
                          userId={profile.id}
                          currentRole={profile.role as 'admin' | 'client'}
                        />
                        <DeleteUserButton
                          userId={profile.id}
                          label={profile.full_name || profile.email}
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

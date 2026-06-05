'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function updateUserRole(
  userId: string,
  newRole: 'admin' | 'client',
): Promise<{ error?: string }> {
  const { user } = await requireAdmin()

  if (userId === user.id) return { error: 'You cannot change your own role.' }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ role: newRole }).eq('id', userId)

  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return {}
}

export async function deleteUser(userId: string): Promise<{ error?: string }> {
  const { user } = await requireAdmin()

  if (userId === user.id) return { error: 'You cannot delete your own account.' }

  const admin = createAdminClient()

  // Deleting the auth user cascades to public.profiles (FK ON DELETE CASCADE),
  // which in turn removes their site_members rows. Tickets and messages they
  // authored are preserved — those FKs are ON DELETE SET NULL — so support
  // history is never lost when a user is removed.
  const { error } = await admin.auth.admin.deleteUser(userId)

  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return {}
}

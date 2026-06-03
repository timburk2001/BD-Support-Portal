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

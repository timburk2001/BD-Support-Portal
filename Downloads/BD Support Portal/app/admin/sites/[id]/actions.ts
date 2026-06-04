'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes, createHash } from 'node:crypto'
import { requireAdmin } from '@/lib/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActionState = { error?: string; success?: boolean }
export type KeyState = { error?: string; rawKey?: string }

export async function updateSite(
  siteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()

  const name = (formData.get('name') as string | null)?.trim()
  const url = (formData.get('url') as string | null)?.trim()

  if (!name) return { error: 'Site name is required.' }
  if (!url) return { error: 'URL is required.' }

  const admin = createAdminClient()
  const { error } = await admin.from('sites').update({ name, url }).eq('id', siteId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/sites/${siteId}`)
  revalidatePath('/admin/sites')
  return { success: true }
}

export async function addSiteMember(
  siteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()

  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  if (!email) return { error: 'Email is required.' }

  const admin = createAdminClient()

  // ── 1. Try public.profiles first (covers users who signed up via portal) ──
  let { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  // ── 2. Fall back to auth.users via RPC ─────────────────────────────────────
  // Users who existed before the on_auth_user_created trigger was added
  // (migration 0003) will have no profiles row.  The RPC reads auth.users
  // directly (SECURITY DEFINER) and auto-creates the missing profile so
  // future lookups work normally.
  if (!profile) {
    const { data: authId, error: rpcError } = await admin
      .rpc('get_auth_user_id_by_email', { user_email: email })

    if (rpcError) return { error: `Lookup failed: ${rpcError.message}` }
    if (!authId) {
      return {
        error: `No account found for ${email}. Ask them to sign up at the portal first.`,
      }
    }

    // Auto-create the missing profile so future queries hit profiles directly.
    await admin
      .from('profiles')
      .insert({ id: authId as string, email, full_name: null })
      .throwOnError()

    profile = { id: authId as string }
  }

  // ── 3. Insert site membership ───────────────────────────────────────────────
  const { error } = await admin
    .from('site_members')
    .insert({ site_id: siteId, user_id: profile.id })

  if (error) {
    if (error.code === '23505') return { error: 'This user is already a member.' }
    return { error: error.message }
  }

  revalidatePath(`/admin/sites/${siteId}`)
  return { success: true }
}

export async function removeSiteMember(siteId: string, userId: string): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()
  await admin.from('site_members').delete().eq('site_id', siteId).eq('user_id', userId)
  revalidatePath(`/admin/sites/${siteId}`)
}

export async function generateApiKey(siteId: string, label: string): Promise<KeyState> {
  await requireAdmin()

  const rawKey = `bdsp_live_${randomBytes(24).toString('hex')}`
  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const admin = createAdminClient()
  const { error } = await admin.from('api_keys').insert({
    site_id: siteId,
    key_hash: keyHash,
    label: label.trim() || null,
  })

  if (error) return { error: error.message }

  revalidatePath(`/admin/sites/${siteId}`)
  return { rawKey }
}

export async function revokeApiKey(keyId: string, siteId: string): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()
  await admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
  revalidatePath(`/admin/sites/${siteId}`)
}

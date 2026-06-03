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

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (!profile) return { error: `No user found with email ${email}.` }

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

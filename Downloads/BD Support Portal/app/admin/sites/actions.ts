'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

export type SiteFormState = { error?: string }

export async function createSite(
  _prev: SiteFormState,
  formData: FormData,
): Promise<SiteFormState> {
  await requireAdmin()

  const name = (formData.get('name') as string | null)?.trim()
  const url = (formData.get('url') as string | null)?.trim()

  if (!name) return { error: 'Site name is required.' }
  if (!url) return { error: 'URL is required.' }

  const admin = createAdminClient()
  const { data: site, error } = await admin
    .from('sites')
    .insert({ name, url })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/admin/sites')
  redirect(`/admin/sites/${site.id}`)
}

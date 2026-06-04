import { type NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendAdminNewTicketEmail, sendSubmitterTicketReceiptEmail } from '@/lib/email'

const IngestSchema = z.object({
  title: z.string().min(1, 'title is required').max(120, 'title must be ≤ 120 chars'),
  description: z.string().optional().transform((v) => v ?? ''),
  page_url: z
    .string()
    .max(2048)
    .optional()
    .transform((v) => v || null),
  browser: z
    .string()
    .max(200)
    .optional()
    .transform((v) => v || null),
  device: z
    .string()
    .max(200)
    .optional()
    .transform((v) => v || null),
  viewport: z
    .string()
    .max(100)
    .optional()
    .transform((v) => v || null),
  submitter_email: z
    .string()
    .email()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  submitter_name: z
    .string()
    .max(200)
    .optional()
    .transform((v) => v || null),
  reply_to_email: z
    .string()
    .email()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  annotated_screenshot: z
    .string()
    .optional()
    .transform((v) => v || null),
  // New: array of screenshots from multi-issue plugin submissions.
  // Takes precedence over the singular field when present.
  annotated_screenshots: z
    .array(z.string())
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
})

export async function POST(request: NextRequest) {
  // ── 1. API key auth ─────────────────────────────────────────────────────────
  const rawKey = request.headers.get('x-api-key')
  if (!rawKey) {
    return NextResponse.json({ error: 'Missing x-api-key header' }, { status: 401 })
  }

  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const admin = createAdminClient()

  const { data: apiKey } = await admin
    .from('api_keys')
    .select('id, site_id')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .maybeSingle()

  if (!apiKey) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 })
  }

  // ── 2. Rate limit (30 req/min per key, in-memory — see lib/rate-limit.ts) ──
  const { ok: allowed } = checkRateLimit(apiKey.id)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded (30 req/min per key)' },
      { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } },
    )
  }

  // ── 3. Touch last_used_at ───────────────────────────────────────────────────
  await admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)

  // ── 4. Read + size-check body ───────────────────────────────────────────────
  let rawText: string
  try {
    rawText = await request.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 })
  }

  if (Buffer.byteLength(rawText, 'utf8') > 4 * 1024 * 1024) {
    return NextResponse.json({ error: 'Request body exceeds 4 MB' }, { status: 413 })
  }

  // ── 5. Parse JSON ───────────────────────────────────────────────────────────
  let json: unknown
  try {
    json = JSON.parse(rawText)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── 6. Validate with Zod ────────────────────────────────────────────────────
  const parsed = IngestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const {
    title,
    description,
    page_url,
    browser,
    device,
    viewport,
    submitter_email,
    submitter_name,
    reply_to_email,
    annotated_screenshot,
    annotated_screenshots,
  } = parsed.data

  // Normalise: prefer the array field; fall back to the singular field.
  const allScreenshots: string[] = annotated_screenshots
    ? annotated_screenshots
    : annotated_screenshot
      ? [annotated_screenshot]
      : []

  // ── 7. Resolve submitted_by (email → profile → site membership check) ───────
  let submittedBy: string | null = null
  if (submitter_email) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', submitter_email)
      .maybeSingle()

    if (profile) {
      const { data: membership } = await admin
        .from('site_members')
        .select('user_id')
        .eq('site_id', apiKey.site_id)
        .eq('user_id', (profile as { id: string }).id)
        .maybeSingle()

      if (membership) {
        submittedBy = (profile as { id: string }).id
      }
    }
  }

  // ── 8. Insert ticket ────────────────────────────────────────────────────────
  const { data: ticket, error: ticketError } = await admin
    .from('tickets')
    .insert({
      site_id: apiKey.site_id,
      submitted_by: submittedBy,
      submitter_email,
      submitter_name,
      reply_to_email,
      method: 'visual',
      title,
      description,
      page_url,
      browser,
      device,
      viewport,
    })
    .select('id')
    .single()

  if (ticketError || !ticket) {
    console.error('[ingest] ticket insert failed:', ticketError?.message)
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
  }

  // ── 9. Upload annotated screenshot(s) ──────────────────────────────────────
  for (let i = 0; i < allScreenshots.length; i++) {
    try {
      let base64Data = allScreenshots[i]
      let contentType = 'image/jpeg'

      // Strip optional data-URL prefix (data:image/jpeg;base64,<data>)
      const match = base64Data.match(/^data:(image\/[^;]+);base64,(.+)$/)
      if (match) {
        contentType = match[1]
        base64Data = match[2]
      }

      const buffer = Buffer.from(base64Data, 'base64')
      // screenshot.jpg for single; screenshot-1.jpg, screenshot-2.jpg … for multi
      const suffix = allScreenshots.length > 1 ? `-${i + 1}` : ''
      const storagePath = `tickets/${ticket.id}/screenshot${suffix}.jpg`

      const { error: uploadError } = await admin.storage
        .from('ticket-attachments')
        .upload(storagePath, buffer, { contentType, upsert: false })

      if (uploadError) {
        console.error(`[ingest] screenshot ${i + 1} upload failed:`, uploadError.message)
      } else {
        await admin.from('ticket_attachments').insert({
          ticket_id: ticket.id,
          storage_path: storagePath,
          kind: 'annotated_screenshot',
          mime_type: contentType,
        })
      }
    } catch (err) {
      console.error(`[ingest] screenshot ${i + 1} processing error:`, err)
    }
  }

  // ── 10. Notify admins + send the submitter a receipt (fire-and-forget) ──────
  ;(async () => {
    const { data: site } = await admin
      .from('sites')
      .select('name')
      .eq('id', apiKey.site_id)
      .single()

    await sendAdminNewTicketEmail({
      ticketId: ticket.id,
      title,
      clientName: submitter_name ?? null,
      clientEmail: submitter_email ?? null,
      replyToEmail: reply_to_email,
      siteName: (site as { name: string } | null)?.name ?? 'Unknown site',
      method: 'visual',
      description,
      attachmentCount: allScreenshots.length,
    })

    // Anonymous submitters get a "create an account to track this" receipt.
    if (!submittedBy && (reply_to_email || submitter_email)) {
      await sendSubmitterTicketReceiptEmail({
        ticketId: ticket.id,
        title,
        submitterEmail: submitter_email,
        replyToEmail: reply_to_email,
      })
    }
  })().catch((e) => console.error('[email] notification failed:', e))

  // ── 11. Respond with tracking + signup URLs so the plugin needn't hardcode
  //        the portal host. ───────────────────────────────────────────────────
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, '')
  const trackUrl = `${baseUrl}/tickets/${ticket.id}`
  const signupRecipient = reply_to_email ?? submitter_email
  const signupUrl =
    `${baseUrl}/signup?next=${encodeURIComponent(`/tickets/${ticket.id}`)}` +
    (signupRecipient ? `&email=${encodeURIComponent(signupRecipient)}` : '')

  return NextResponse.json({
    ok: true,
    ticket_id: ticket.id,
    track_url: trackUrl,
    signup_url: signupUrl,
  })
}

import { type NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SYSTEM_PROMPT =
  'You are a web support engineer helping triage a client request for a WordPress site. ' +
  'Suggest the most likely fix in 3–6 sentences. ' +
  'If it looks like a content/text edit, give the exact before/after. ' +
  'If CSS, give a minimal snippet. ' +
  'If it requires investigation, say so and list what to check. ' +
  'Do not invent facts.'

interface TicketRow {
  title: string
  description: string
  page_url: string | null
  browser: string | null
  device: string | null
  viewport: string | null
}

interface MessageRow {
  body: string
  profiles: unknown
}

function buildPrompt(ticket: TicketRow, messages: MessageRow[]): string {
  const lines: string[] = [
    `Title: ${ticket.title}`,
    '',
    'Description:',
    ticket.description,
  ]

  const meta: string[] = []
  if (ticket.page_url) meta.push(`Page URL: ${ticket.page_url}`)
  if (ticket.browser) meta.push(`Browser: ${ticket.browser}`)
  if (ticket.device) meta.push(`Device: ${ticket.device}`)
  if (ticket.viewport) meta.push(`Viewport: ${ticket.viewport}`)

  if (meta.length > 0) {
    lines.push('', 'Environment:', ...meta.map((m) => `- ${m}`))
  }

  if (messages.length > 0) {
    lines.push('', 'Public conversation (earliest first):')
    for (const msg of messages) {
      const p = (Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles) as
        | { role?: string }
        | null
      const author = p?.role === 'admin' ? 'Support team' : 'Client'
      lines.push(`${author}: ${msg.body}`)
    }
  }

  return lines.join('\n')
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── 1. Verify admin ────────────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: ticketId } = await params

  // ── 2. Load ticket ─────────────────────────────────────────────────────────
  const admin = createAdminClient()

  const { data: ticket } = await admin
    .from('tickets')
    .select('title, description, page_url, browser, device, viewport')
    .eq('id', ticketId)
    .single()

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // ── 3. Load non-internal messages only (keep internal notes out of the prompt)
  const { data: messages } = await admin
    .from('ticket_messages')
    .select('body, profiles(role)')
    .eq('ticket_id', ticketId)
    .eq('is_internal', false)
    .order('created_at', { ascending: true })
    .limit(10)

  // ── 4. Call Anthropic ──────────────────────────────────────────────────────
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001'
  const prompt = buildPrompt(ticket as TicketRow, (messages ?? []) as MessageRow[])

  let content: string
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model,
      max_tokens: 800,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const block = response.content[0]
    if (!block || block.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response from AI' }, { status: 500 })
    }
    content = block.text
  } catch (err) {
    console.error('[ai-recommend] Anthropic error:', err)
    const msg = err instanceof Error ? err.message : 'AI service unavailable'
    return NextResponse.json({ error: `AI request failed: ${msg}` }, { status: 500 })
  }

  // ── 5. Persist recommendation ──────────────────────────────────────────────
  const { data: rec, error: insertError } = await admin
    .from('ai_recommendations')
    .insert({
      ticket_id: ticketId,
      requested_by: user.id,
      model,
      content,
    })
    .select('id, content, model, created_at, ticket_id')
    .single()

  if (insertError || !rec) {
    console.error('[ai-recommend] insert failed:', insertError?.message)
    return NextResponse.json({ error: 'Failed to save recommendation' }, { status: 500 })
  }

  return NextResponse.json({ recommendation: rec })
}

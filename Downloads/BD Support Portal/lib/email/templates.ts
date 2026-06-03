function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

function shell(body: string, footerNote: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;margin:0;padding:24px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;margin:0 auto;">
  <tr><td>
    <div style="background:#18181b;border-radius:8px 8px 0 0;padding:16px 24px;">
      <p style="color:#ffffff;font-size:13px;font-weight:600;margin:0;letter-spacing:0.01em;">BD Support Portal</p>
    </div>
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 8px 8px;padding:28px 24px;">
      ${body}
    </div>
    <p style="color:#a1a1aa;font-size:11px;text-align:center;margin:16px 0 0;">${footerNote}</p>
  </td></tr>
</table>
</body>
</html>`
}

function btn(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:#18181b;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;padding:10px 20px;border-radius:6px;margin-top:20px;">${esc(label)}</a>`
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:5px 0;color:#71717a;font-size:12px;width:110px;vertical-align:top;">${label}</td>
    <td style="padding:5px 0;color:#18181b;font-size:12px;vertical-align:top;">${value}</td>
  </tr>`
}

// ─── Template 1: admin new ticket ────────────────────────────────────────────

interface AdminNewTicketProps {
  ticketId: string
  title: string
  clientName: string | null
  clientEmail: string | null
  siteName: string
  method: string
  description: string
  attachmentCount: number
  adminUrl: string
}

export function adminNewTicketHtml(p: AdminNewTicketProps): string {
  const clientDisplay = p.clientName
    ? `${esc(p.clientName)}${p.clientEmail ? ` &lt;${esc(p.clientEmail)}&gt;` : ''}`
    : p.clientEmail
      ? esc(p.clientEmail)
      : '—'

  const descriptionTrimmed =
    p.description.length > 400 ? esc(p.description.slice(0, 400)) + '…' : esc(p.description)

  const body = `
    <h2 style="color:#18181b;font-size:18px;font-weight:600;margin:0 0 6px;">New support ticket</h2>
    <p style="color:#71717a;font-size:13px;margin:0 0 24px;">A new ticket has been submitted and is waiting for your attention.</p>

    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:20px;">
      ${row('Title', `<strong>${esc(p.title)}</strong>`)}
      ${row('Site', esc(p.siteName))}
      ${row('Submitted by', clientDisplay)}
      ${row('Method', esc(p.method.charAt(0).toUpperCase() + p.method.slice(1)))}
      ${p.attachmentCount > 0 ? row('Attachments', String(p.attachmentCount)) : ''}
    </table>

    <div style="background:#f4f4f5;border-radius:6px;padding:14px 16px;margin-bottom:4px;">
      <p style="color:#52525b;font-size:12px;font-weight:500;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Description</p>
      <p style="color:#18181b;font-size:13px;line-height:1.6;margin:0;white-space:pre-wrap;">${descriptionTrimmed}</p>
    </div>

    ${btn(p.adminUrl, 'View ticket →')}`

  return shell(body, 'You received this because you are a support admin.')
}

// ─── Template 2: client status change ────────────────────────────────────────

interface ClientStatusChangeProps {
  title: string
  status: string
  ticketUrl: string
}

export function clientStatusChangeHtml(p: ClientStatusChangeProps): string {
  const statusLabel = STATUS_LABELS[p.status] ?? p.status

  const body = `
    <h2 style="color:#18181b;font-size:18px;font-weight:600;margin:0 0 6px;">Ticket status updated</h2>
    <p style="color:#71717a;font-size:13px;margin:0 0 24px;">Your support ticket has been updated by our team.</p>

    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:20px;">
      ${row('Ticket', `<strong>${esc(p.title)}</strong>`)}
      ${row('New status', `<span style="font-weight:600;color:#18181b;">${esc(statusLabel)}</span>`)}
    </table>

    ${btn(p.ticketUrl, 'View your ticket →')}`

  return shell(body, 'You received this because you submitted a support ticket.')
}

// ─── Template 3: client staff reply ──────────────────────────────────────────

interface ClientStaffReplyProps {
  title: string
  excerpt: string
  ticketUrl: string
}

export function clientStaffReplyHtml(p: ClientStaffReplyProps): string {
  const excerptSafe =
    p.excerpt.length > 300 ? esc(p.excerpt.slice(0, 300)) + '…' : esc(p.excerpt)

  const body = `
    <h2 style="color:#18181b;font-size:18px;font-weight:600;margin:0 0 6px;">New reply on your ticket</h2>
    <p style="color:#71717a;font-size:13px;margin:0 0 24px;">Our support team has replied to your ticket.</p>

    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:20px;">
      ${row('Ticket', `<strong>${esc(p.title)}</strong>`)}
    </table>

    <div style="background:#f4f4f5;border-radius:6px;padding:14px 16px;margin-bottom:4px;">
      <p style="color:#52525b;font-size:12px;font-weight:500;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Reply preview</p>
      <p style="color:#18181b;font-size:13px;line-height:1.6;margin:0;white-space:pre-wrap;">${excerptSafe}</p>
    </div>

    ${btn(p.ticketUrl, 'Reply →')}`

  return shell(body, 'You received this because you submitted a support ticket.')
}

export type TicketStatus = 'new' | 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketMethod = 'visual' | 'standard'
export type AttachmentKind = 'annotated_screenshot' | 'upload'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: 'client' | 'admin'
  created_at: string
}

export interface Site {
  id: string
  name: string
  url: string
  created_at: string
}

export interface Ticket {
  id: string
  site_id: string
  submitted_by: string | null
  submitter_email: string | null
  reply_to_email: string | null
  method: TicketMethod
  title: string
  description: string
  page_url: string | null
  browser: string | null
  device: string | null
  viewport: string | null
  status: TicketStatus
  created_at: string
  updated_at: string
}

export interface TicketAttachment {
  id: string
  ticket_id: string
  storage_path: string
  kind: AttachmentKind
  mime_type: string | null
  created_at: string
}

export interface TicketMessage {
  id: string
  ticket_id: string
  author_id: string | null
  body: string
  is_internal: boolean
  created_at: string
}

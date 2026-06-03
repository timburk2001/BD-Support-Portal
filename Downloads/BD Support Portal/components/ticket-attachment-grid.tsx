import type { TicketAttachment } from '@/lib/types'

interface AttachmentWithUrl extends TicketAttachment {
  signedUrl: string | null
}

interface TicketAttachmentGridProps {
  attachments: AttachmentWithUrl[]
}

export function TicketAttachmentGrid({ attachments }: TicketAttachmentGridProps) {
  if (attachments.length === 0) return null

  // Sort: annotated_screenshot first, then uploads
  const sorted = [...attachments].sort((a, b) => {
    if (a.kind === 'annotated_screenshot' && b.kind !== 'annotated_screenshot') return -1
    if (b.kind === 'annotated_screenshot' && a.kind !== 'annotated_screenshot') return 1
    return 0
  })

  const annotated = sorted.filter((a) => a.kind === 'annotated_screenshot')
  const uploads = sorted.filter((a) => a.kind !== 'annotated_screenshot')

  return (
    <div className="space-y-4">
      {/* Annotated screenshot shown prominently */}
      {annotated.map((att) => (
        <div key={att.id}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Annotated Screenshot
          </p>
          <AttachmentCard att={att} prominent />
        </div>
      ))}

      {/* Regular uploads in a grid */}
      {uploads.length > 0 && (
        <div>
          {annotated.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Attachments
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {uploads.map((att) => (
              <AttachmentCard key={att.id} att={att} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AttachmentCard({
  att,
  prominent = false,
}: {
  att: AttachmentWithUrl
  prominent?: boolean
}) {
  const isImage = att.mime_type?.startsWith('image/') ?? false
  const filename = att.storage_path.split('/').pop() ?? 'file'
  const href = att.signedUrl ?? `/api/attachments/${att.id}`

  if (prominent && isImage && att.signedUrl) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-lg border border-border hover:opacity-90 transition-opacity"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.signedUrl}
          alt="Annotated screenshot"
          className="w-full object-contain max-h-[500px] bg-muted/30"
        />
      </a>
    )
  }

  if (isImage && att.signedUrl) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group block overflow-hidden rounded-md border border-border hover:border-primary/40 transition-colors"
        title={filename}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.signedUrl}
          alt={filename}
          className="h-32 w-full object-cover bg-muted/30 group-hover:opacity-90 transition-opacity"
        />
        <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{filename}</p>
      </a>
    )
  }

  // PDF or generic file
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-2 rounded-md border border-border p-4 text-center hover:border-primary/40 hover:bg-muted/30 transition-colors"
      title={filename}
    >
      <FileTypeIcon mime={att.mime_type ?? ''} />
      <p className="w-full truncate text-xs text-muted-foreground">{filename}</p>
    </a>
  )
}

function FileTypeIcon({ mime }: { mime: string }) {
  const isPdf = mime === 'application/pdf'
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
      {isPdf ? (
        <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ) : (
        <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      )}
    </div>
  )
}

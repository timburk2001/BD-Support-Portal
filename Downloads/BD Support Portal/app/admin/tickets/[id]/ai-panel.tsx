'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { relativeDate } from '@/lib/format'

interface Recommendation {
  id: string
  content: string
  model: string
  created_at: string
}

interface AiPanelProps {
  ticketId: string
  initialRecommendations: Recommendation[]
}

// Tailwind-styled components for react-markdown output
const md: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc pl-4 text-sm leading-relaxed space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal pl-4 text-sm leading-relaxed space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children }) => (
    <code
      className={cn(
        'font-mono text-xs',
        // Block code (inside pre) has a language-* className; inline does not
        !className && 'rounded bg-muted px-1 py-0.5',
      )}
    >
      {children}
    </code>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
}

export function AiPanel({ ticketId, initialRecommendations }: AiPanelProps) {
  const [recs, setRecs] = useState<Recommendation[]>(initialRecommendations)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRequest() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/ai-recommend`, { method: 'POST' })
      const data: { recommendation?: Recommendation; error?: string } = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Request failed')
        return
      }
      if (data.recommendation) {
        setRecs((prev) => [data.recommendation!, ...prev])
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-medium">AI Recommendation</CardTitle>
          <Badge
            variant="outline"
            className="h-4 border-purple-200 bg-purple-50 py-0 text-[10px] text-purple-700"
          >
            Admin only
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button size="sm" onClick={handleRequest} disabled={loading} className="w-full">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Thinking…
            </span>
          ) : recs.length > 0 ? (
            'Request another recommendation'
          ) : (
            'Request AI fix recommendation'
          )}
        </Button>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {recs.length === 0 && !error && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No recommendations yet. Click the button to generate one.
          </p>
        )}

        <div className="space-y-3">
          {recs.map((rec, i) => (
            <div
              key={rec.id}
              className={cn(
                'rounded-lg border p-4',
                i === 0
                  ? 'border-primary/20 bg-primary/[0.03]'
                  : 'border-border bg-muted/20',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {i === 0 ? 'Latest' : `Recommendation ${recs.length - i}`}
                </span>
                <time className="text-[10px] text-muted-foreground">
                  {relativeDate(rec.created_at)}
                </time>
              </div>
              <div className="text-foreground">
                <ReactMarkdown components={md}>{rec.content}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

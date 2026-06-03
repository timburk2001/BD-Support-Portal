'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { generateApiKey, revokeApiKey } from './actions'
import { formatDate } from '@/lib/format'

interface ApiKey {
  id: string
  label: string | null
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

interface ApiKeySectionProps {
  siteId: string
  apiKeys: ApiKey[]
}

export function ApiKeySection({ siteId, apiKeys }: ApiKeySectionProps) {
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateApiKey(siteId, label)
      if (result.rawKey) {
        setGeneratedKey(result.rawKey)
        setLabel('')
      } else if (result.error) {
        toast.error(result.error)
      }
    })
  }

  function handleCopy() {
    if (!generatedKey) return
    navigator.clipboard.writeText(generatedKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleCloseDialog(open: boolean) {
    if (!open) {
      setGeneratedKey(null)
      setCopied(false)
    }
  }

  return (
    <div className="space-y-4">
      {apiKeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No API keys yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {apiKeys.map((key) => (
            <li key={key.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{key.label || 'Unnamed key'}</p>
                  {key.revoked_at ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 py-0 border-red-200 bg-red-50 text-red-700"
                    >
                      Revoked
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 py-0 border-green-200 bg-green-50 text-green-700"
                    >
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {formatDate(key.created_at)}
                  {key.last_used_at && ` · Last used ${formatDate(key.last_used_at)}`}
                  {key.revoked_at && ` · Revoked ${formatDate(key.revoked_at)}`}
                </p>
              </div>
              {!key.revoked_at && (
                <form action={revokeApiKey.bind(null, key.id, siteId)}>
                  <Button type="submit" variant="outline" size="sm">
                    Revoke
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pt-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Key label (optional)"
          className="h-8 max-w-64"
        />
        <Button size="sm" onClick={handleGenerate} disabled={isPending}>
          {isPending ? 'Generating…' : 'Generate new key'}
        </Button>
      </div>

      <Dialog open={!!generatedKey} onOpenChange={handleCloseDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy this key now — it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-xs break-all select-all">
            {generatedKey}
          </div>
          <DialogFooter showCloseButton={false}>
            <Button variant="outline" onClick={() => handleCloseDialog(false)}>
              Done
            </Button>
            <Button onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { bytesToHuman } from '@/lib/format'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ACCEPT = 'image/*,application/pdf'

interface SelectedFile {
  file: File
  id: string
  error?: string
}

interface FileUploaderProps {
  /** Name attribute forwarded to the hidden file inputs so a parent <form> picks them up */
  name?: string
  /** Max files allowed */
  maxFiles?: number
}

export function FileUploader({ name = 'attachments', maxFiles = 10 }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<SelectedFile[]>([])
  const [dragging, setDragging] = useState(false)

  const addFiles = useCallback((incoming: File[]) => {
    const next: SelectedFile[] = incoming.map((file) => ({
      file,
      id: `${file.name}-${file.size}-${Math.random()}`,
      error: file.size > MAX_SIZE ? `File exceeds 10 MB limit` : undefined,
    }))
    setFiles((prev) => {
      const combined = [...prev, ...next]
      return combined.slice(0, maxFiles)
    })
  }, [maxFiles])

  function remove(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files))
  }

  const hasErrors = files.some((f) => f.error)

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors
          ${dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40'
          }`}
      >
        <svg className="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 16v-8m0 0-3 3m3-3 3 3M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 10V7a4 4 0 00-8 0v3" />
        </svg>
        <div>
          <span className="text-sm font-medium text-foreground">Click to upload</span>
          <span className="text-sm text-muted-foreground"> or drag and drop</span>
        </div>
        <p className="text-xs text-muted-foreground">Images and PDFs · max 10 MB each</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Selected files — rendered as hidden inputs so FormData picks them up */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((sf) => (
            <li
              key={sf.id}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm
                ${sf.error ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/30'}`}
            >
              <FileIcon mime={sf.file.type} />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{sf.file.name}</p>
                <p className={`text-xs ${sf.error ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {sf.error ?? bytesToHuman(sf.file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => remove(sf.id)}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>

              {/* Hidden input — carries the actual File into the FormData */}
              {!sf.error && (
                <input
                  type="file"
                  name={name}
                  className="hidden"
                  // We need a data transfer trick: create a FileList via a DataTransfer
                  ref={(el) => {
                    if (!el) return
                    const dt = new DataTransfer()
                    dt.items.add(sf.file)
                    el.files = dt.files
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {hasErrors && (
        <p className="text-xs text-destructive">Remove files with errors before submitting.</p>
      )}
    </div>
  )
}

function FileIcon({ mime }: { mime: string }) {
  const isImage = mime.startsWith('image/')
  const isPdf = mime === 'application/pdf'

  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-muted">
      {isImage ? (
        <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ) : isPdf ? (
        <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ) : (
        <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      )}
    </div>
  )
}

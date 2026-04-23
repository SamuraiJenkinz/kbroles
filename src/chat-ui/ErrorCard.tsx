'use client'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { ErrorCode } from './types'

const TITLE: Record<ErrorCode, string> = {
  upstream_timeout: 'The knowledge service took too long.',
  upstream_5xx: 'The knowledge service is temporarily unavailable.',
  schema_reject_after_retry: 'We could not format the answer.',
  internal: 'Something went wrong.',
}

export function ErrorCard({
  errorCode,
  requestId,
  message,
  onRetry,
}: {
  errorCode: ErrorCode
  requestId: string
  message?: string
  onRetry: () => void
}) {
  const [open, setOpen] = useState(false)
  const isRateLimited = errorCode === 'internal' && (message ?? '').startsWith('rate_limited:')
  const title = isRateLimited ? 'The assistant is busy.' : (TITLE[errorCode] ?? TITLE.internal)

  return (
    <div
      role="alert"
      className="my-3 flex items-start gap-3 rounded-lg border border-warning-600/40 bg-warning-50 p-4"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning-600" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-neutral-muted">Your question wasn&apos;t answered.</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs text-white hover:opacity-90"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-xs text-neutral-muted underline"
          >
            {open ? 'Hide details' : 'Details'}
          </button>
        </div>
        {open && (
          <p className="mt-2 rounded bg-white/60 p-2 font-mono text-[11px]">
            Request ID: {requestId}
          </p>
        )}
      </div>
    </div>
  )
}

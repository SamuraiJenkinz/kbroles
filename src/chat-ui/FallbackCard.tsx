'use client'
import { useState } from 'react'
import { CircleOff, Mail, Check } from 'lucide-react'
import type { Message } from './types'
import type { Role } from './types'
import { buildFlagGapMailto } from './mailto'
import { cn } from './cn'

/**
 * Visually distinct fallback — NOT a styled Message.
 *
 * Pitfall 20 three independent signals:
 *   1. amber border (border-amber-400 dark:border-amber-600)
 *   2. amber-tinted background (bg-amber-50 dark:bg-amber-950/20)
 *   3. CircleOff icon + bold heading (vs normal prose)
 *
 * Pitfall 16 (icon+colour): every amber element carries the CircleOff icon.
 *
 * NO avatar, timestamp, feedback thumbs, or Copy controls — this is NOT an answer.
 *
 * Flag link is an `<a href={mailtoHref}>` (NOT imperative `window.location.href = ...`)
 * so the URL is assertable via `toHaveAttribute('href', /^mailto:/)` in Playwright
 * without any window.location monkeypatching.
 */
export function FallbackCard({
  message,
  role,
  contentStewardEmail,
  userQuestion,
}: {
  message: Extract<Message, { kind: 'assistant' }>
  role: Role
  contentStewardEmail: string
  userQuestion: string
}) {
  const [flagged, setFlagged] = useState(false)

  const mailtoHref = buildFlagGapMailto({
    email: contentStewardEmail,
    question: userQuestion,
    role,
    requestId: message.requestId ?? 'unknown',
  })

  const handleClick = () => {
    // Let the browser's default mailto handler fire (no preventDefault).
    // onClick is purely for the UX state swap to the "Opened ✓" label.
    setFlagged(true)
  }

  return (
    <div
      role="region"
      aria-label="Fallback response"
      className={cn(
        // Signal 1: amber border
        'mx-4 rounded-lg border border-amber-400 dark:border-amber-600',
        // Signal 2: amber-tinted background
        'bg-amber-50 dark:bg-amber-950/20',
        // Spacing
        'p-4',
      )}
    >
      <div className="flex items-start gap-2">
        {/* Signal 3a: CircleOff icon (Pitfall 16 — never colour alone) */}
        <CircleOff
          size={18}
          className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="flex-1">
          {/* Signal 3b: bold heading (Pitfall 20 — typographic weight signal) */}
          <h3 className="mb-1 text-sm font-bold text-amber-900 dark:text-amber-200">
            Outside my knowledge
          </h3>
          {/* Verbatim server-supplied §15 fallback text */}
          <p className="whitespace-pre-wrap text-sm text-amber-950 dark:text-amber-100">
            {message.text}
          </p>
          <a
            href={mailtoHref}
            onClick={handleClick}
            className={cn(
              'mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-700 bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm no-underline',
              'hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500',
            )}
            aria-label="Flag this gap to the CTSS Knowledge team"
          >
            {flagged ? (
              <>
                <Check size={14} aria-hidden />
                Opened in mail client
              </>
            ) : (
              <>
                <Mail size={14} aria-hidden />
                Flag this gap
              </>
            )}
          </a>
        </div>
      </div>
    </div>
  )
}

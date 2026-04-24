'use client'
import { Copy, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useState } from 'react'
import type { Message, Feedback } from './types'
import { resolveSourceTitle } from '@/ui/sourceTitles'
import { FeedbackPanel } from './FeedbackPanel'
import { sendFeedback } from '@/lib/telemetryClient'

export function AssistantControls({
  message,
  onFeedback,
  onCopy,
}: {
  message: Extract<Message, { kind: 'assistant' }>
  onFeedback: (next: Feedback | null) => void
  onCopy?: () => void
}) {
  const [showFeedback, setShowFeedback] = useState(false)

  const feedback = message.feedback ?? null
  const isDown = feedback !== null && feedback !== 'up'

  async function handleCopy() {
    let text = message.text
    if (message.citations.length > 0) {
      const cit = message.citations[0]
      const title = resolveSourceTitle(cit.section_id) ?? cit.section_id
      text = `${text}\n\n(Source: ${cit.source_id} · ${title})`
    }
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Graceful no-op when clipboard API is unavailable (Pitfall 10)
    }
    onCopy?.()
  }

  // Phase 6 Plan 03: extract citation ids for FDBK-03 payload.
  const firstCitation = message.citations[0]
  const citation_source_id = firstCitation?.source_id
  const citation_section_id = firstCitation?.section_id

  function handleThumbUp() {
    if (feedback === 'up') {
      onFeedback(null)
    } else {
      onFeedback('up')
      // Phase 6 Plan 03 — send telemetry on thumbs-up.
      if (message.message_id) {
        void sendFeedback({
          message_id: message.message_id,
          rating: 'up',
          citation_source_id,
          citation_section_id,
        })
      }
    }
  }

  function handleThumbDown() {
    if (isDown) {
      // Toggle off existing down feedback
      onFeedback(null)
      return
    }
    if (showFeedback) {
      // Panel is open — close without dispatching (Cancel semantics)
      setShowFeedback(false)
      return
    }
    // No feedback yet — open the panel
    setShowFeedback(true)
  }

  function handleReason(reason: Extract<Feedback, { kind: 'down' }>['reason']) {
    onFeedback({ kind: 'down', reason })
    setShowFeedback(false)
    // Phase 6 Plan 03 — send telemetry on thumbs-down with reason.
    // Reason is required before sendFeedback is called (FDBK-02: no raw-text,
    // dropdown must commit a reason first).
    // Map FeedbackDown's internal snake_case reason to the API's space-separated enum.
    // FeedbackDown uses 'wrong_citation' (for chatReducer / Redux convention) but
    // the /api/feedback Zod schema uses 'wrong citation' (matching FDBK-03 verbatim).
    const apiReason = (reason === 'wrong_citation' ? 'wrong citation' : reason) as
      'hallucinated' | 'wrong citation' | 'incomplete' | 'other'
    if (message.message_id) {
      void sendFeedback({
        message_id: message.message_id,
        rating: 'down',
        reason: apiReason,
        citation_source_id,
        citation_section_id,
      })
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy answer"
          className="rounded p-1 text-neutral-muted hover:bg-neutral-100 hover:text-foreground"
        >
          <Copy size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={handleThumbUp}
          aria-pressed={feedback === 'up'}
          aria-label="Helpful"
          className="rounded p-1 text-neutral-muted hover:bg-neutral-100 hover:text-foreground aria-pressed:text-primary"
        >
          <ThumbsUp size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={handleThumbDown}
          aria-pressed={isDown}
          aria-label="Not helpful"
          className="rounded p-1 text-neutral-muted hover:bg-neutral-100 hover:text-foreground aria-pressed:text-primary"
        >
          <ThumbsDown size={14} aria-hidden />
        </button>
      </div>
      {showFeedback && (
        <FeedbackPanel
          onReason={handleReason}
          onCancel={() => setShowFeedback(false)}
        />
      )}
    </div>
  )
}

'use client'
import { Copy, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useState } from 'react'
import type { Message, Feedback } from './types'
import { resolveSourceTitle } from '@/ui/sourceTitles'
import { FeedbackPanel } from './FeedbackPanel'

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

  function handleThumbUp() {
    if (feedback === 'up') {
      onFeedback(null)
    } else {
      onFeedback('up')
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

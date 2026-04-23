'use client'
import { Info, Paperclip } from 'lucide-react'
import type { Message as MessageType, Feedback } from './types'
import { cn } from './cn'
import { ErrorCard } from './ErrorCard'
import { AssistantControls } from './AssistantControls'
import { Timestamp } from './Timestamp'

export function Message({
  message,
  onCopy,
  onFeedback,
  onRetry,
}: {
  message: MessageType
  onCopy?: (id: string) => void
  onFeedback?: (id: string, next: Feedback | null) => void
  onRetry?: (id: string) => void
}) {
  if (message.kind === 'user') {
    return (
      <div className="flex justify-end px-4">
        <div
          className={cn(
            'max-w-[70ch] rounded-xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-white',
          )}
        >
          <p className="whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
    )
  }

  // Assistant message
  if (message.state === 'error') {
    return (
      <div className="px-4">
        <ErrorCard
          errorCode={message.errorCode ?? 'internal'}
          requestId={message.requestId ?? ''}
          onRetry={() => onRetry?.(message.id)}
        />
      </div>
    )
  }

  const isFallback = message.state === 'fallback'
  const showControls = message.state === 'done' || message.state === 'fallback'

  return (
    <div className="flex items-start gap-2 px-4">
      {/* KB avatar */}
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-600">
        KB
      </span>

      <div className="max-w-[70ch] flex-1">
        <div
          className={cn(
            'rounded-xl rounded-tl-sm bg-neutral-100 px-4 py-2.5 text-sm',
            isFallback && 'border-l-4 border-warning-600 pl-3',
          )}
        >
          {isFallback && (
            <span className="mb-1 flex items-center gap-1 text-xs text-warning-600">
              <Info size={14} aria-hidden />
              <span>This answer is a general response</span>
            </span>
          )}
          <p className="whitespace-pre-wrap">{message.text}</p>

          {/* Citations */}
          {message.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.citations.map((cit) => (
                <span
                  key={`${cit.source_id}-${cit.section_id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-border bg-white px-2 py-0.5 text-[11px] text-neutral-600"
                >
                  <Paperclip size={10} aria-hidden />
                  {cit.source_id} · §{cit.section_id}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <Timestamp at={message.at} />
          {showControls && (
            <AssistantControls
              message={message}
              onFeedback={(next) => onFeedback?.(message.id, next)}
              onCopy={() => onCopy?.(message.id)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

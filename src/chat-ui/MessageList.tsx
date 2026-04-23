'use client'
import type { Message as MessageType, Feedback } from './types'
import { Message } from './Message'
import { TypingDots } from './TypingDots'

export function MessageList({
  messages,
  inFlightId,
  onCopy,
  onFeedback,
  onRetry,
}: {
  messages: MessageType[]
  inFlightId: string | null
  onCopy?: (id: string) => void
  onFeedback?: (id: string, next: Feedback | null) => void
  onRetry?: (id: string) => void
}) {
  if (messages.length === 0) return null

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      {messages.map((m) => {
        // When the in-flight assistant bubble has empty text, render TypingDots instead
        if (
          m.kind === 'assistant' &&
          m.state === 'streaming' &&
          m.text === '' &&
          m.id === inFlightId
        ) {
          return (
            <div key={m.id} className="flex items-start gap-2 px-4">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-600">
                KB
              </span>
              <div className="max-w-[70ch] flex-1 rounded-xl rounded-tl-sm bg-neutral-100 px-4 py-2.5">
                <TypingDots />
              </div>
            </div>
          )
        }

        return (
          <Message
            key={m.id}
            message={m}
            onCopy={onCopy}
            onFeedback={onFeedback}
            onRetry={onRetry}
          />
        )
      })}
    </div>
  )
}

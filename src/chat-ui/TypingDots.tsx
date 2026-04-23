'use client'

export function TypingDots() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-1 px-3 py-2">
      <span className="sr-only">Assistant is typing</span>
      <span className="size-2 animate-bounce rounded-full bg-neutral-muted [animation-delay:-0.3s]" />
      <span className="size-2 animate-bounce rounded-full bg-neutral-muted [animation-delay:-0.15s]" />
      <span className="size-2 animate-bounce rounded-full bg-neutral-muted" />
    </div>
  )
}

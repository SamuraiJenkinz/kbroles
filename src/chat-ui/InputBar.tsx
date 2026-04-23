'use client'
import { forwardRef } from 'react'
import { Send, Square } from 'lucide-react'

export interface InputBarProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onStop: () => void
  isStreaming: boolean
  placeholder: string
  hintVisible?: boolean
}

export const InputBar = forwardRef<HTMLTextAreaElement, InputBarProps>(function InputBar(
  { value, onChange, onSubmit, onStop, isStreaming, placeholder, hintVisible },
  ref,
) {
  const canSubmit = value.trim().length > 0 && !isStreaming

  return (
    <div className="border-t border-neutral-border p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (canSubmit) onSubmit()
            }
          }}
          placeholder={placeholder}
          rows={1}
          style={{ minHeight: '44px', maxHeight: '160px' }}
          className="flex-1 resize-none overflow-y-auto rounded-md border border-neutral-border bg-white px-3 py-2 text-sm"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop response"
            className="rounded-md bg-foreground p-2 text-white"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            aria-label="Send message"
            className="rounded-md bg-foreground p-2 text-white disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        )}
      </div>
      {hintVisible && (
        <p className="mt-1 text-[11px] text-neutral-muted">Enter to send · Shift+Enter for newline</p>
      )}
    </div>
  )
})

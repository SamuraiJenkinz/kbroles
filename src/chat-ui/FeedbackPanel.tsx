'use client'
import * as RadioGroup from '@radix-ui/react-radio-group'
import type { FeedbackDown } from './types'

const REASONS: Array<{ id: FeedbackDown['reason']; label: string }> = [
  { id: 'hallucinated', label: 'Hallucinated' },
  { id: 'wrong_citation', label: 'Wrong citation' },
  { id: 'incomplete', label: 'Incomplete' },
  { id: 'other', label: 'Other' },
]

export function FeedbackPanel({
  onReason,
  onCancel,
}: {
  onReason: (r: FeedbackDown['reason']) => void
  onCancel: () => void
}) {
  return (
    <div
      role="region"
      aria-label="Why was this answer not helpful?"
      className="mt-2 rounded-md border border-neutral-border bg-neutral-50 p-3"
    >
      <p className="mb-2 text-xs font-medium text-neutral-muted">
        Why was this answer not helpful?
      </p>
      <RadioGroup.Root
        className="grid gap-1.5"
        onValueChange={(v) => onReason(v as FeedbackDown['reason'])}
      >
        {REASONS.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <RadioGroup.Item
              value={r.id}
              id={`fb-${r.id}`}
              className="size-4 rounded-full border border-neutral-border"
            >
              <RadioGroup.Indicator className="flex size-full items-center justify-center after:block after:size-2 after:rounded-full after:bg-primary" />
            </RadioGroup.Item>
            <label htmlFor={`fb-${r.id}`} className="text-sm">
              {r.label}
            </label>
          </div>
        ))}
      </RadioGroup.Root>
      <button onClick={onCancel} className="mt-2 text-xs text-neutral-muted underline">
        Cancel
      </button>
    </div>
  )
}

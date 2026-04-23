'use client'
import * as Popover from '@radix-ui/react-popover'
import { Info, X } from 'lucide-react'
import { useAboutTooltip } from './useAboutTooltip'
import { cn } from './cn'

/**
 * About popover — Radix Popover (NOT Tooltip).
 *
 * Tooltip is hover-only. Popover stays open and is click-dismissable.
 * Two triggers:
 *  1. First-run auto-open (via useAboutTooltip localStorage gate)
 *  2. ℹ icon button click — always re-opens
 *
 * Content: three bullets covering what the assistant can/can't answer
 * and how to flag a gap.
 */
export function AboutPopover({ children }: { children: React.ReactNode }) {
  const { open, setOpen, dismiss } = useAboutTooltip()

  return (
    <Popover.Root open={open} onOpenChange={(next) => setOpen(next)}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="end"
          className={cn(
            'z-50 w-[320px] max-w-[90vw] rounded-md border border-neutral-200 bg-white p-4 shadow-lg',
          )}
          aria-labelledby="about-popover-title"
        >
          <div className="mb-2 flex items-start justify-between">
            <h3
              id="about-popover-title"
              className="flex items-center gap-1.5 text-sm font-semibold"
            >
              <Info size={14} aria-hidden />
              About this assistant
            </h3>
            <Popover.Close
              aria-label="Dismiss About popover"
              onClick={dismiss}
              className="-mr-1 -mt-1 rounded p-1 text-neutral-500 hover:bg-neutral-100"
            >
              <X size={14} aria-hidden />
            </Popover.Close>
          </div>
          <ul className="space-y-2 text-xs text-neutral-700">
            <li>
              <strong className="font-semibold text-neutral-900">What I can answer:</strong>{' '}
              flagging procedures (KB0022991), knowledge-article lifecycle (KB0020882), and
              article form-field guidance.
            </li>
            <li>
              <strong className="font-semibold text-neutral-900">What I can&#39;t:</strong>{' '}
              anything outside those three sources, personal account info, or real-time status.
            </li>
            <li>
              <strong className="font-semibold text-neutral-900">How to flag a gap:</strong>{' '}
              when I can&#39;t answer, use the &ldquo;Flag this gap&rdquo; button on the fallback card.
            </li>
          </ul>
          <button
            type="button"
            onClick={dismiss}
            className="mt-3 w-full rounded-md border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            Got it
          </button>
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

'use client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { formatRelative } from '@/lib/time'

export function Timestamp({ at }: { at: number }) {
  const relative = formatRelative(Date.now(), at)
  const absolute = new Date(at).toLocaleString()

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <time
          dateTime={new Date(at).toISOString()}
          tabIndex={0}
          className="cursor-default select-none text-[11px] text-neutral-muted outline-none focus-visible:underline"
        >
          {relative}
        </time>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={4}
          className="rounded bg-neutral-900 px-2 py-1 text-xs text-white shadow"
        >
          {absolute}
          <Tooltip.Arrow className="fill-neutral-900" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

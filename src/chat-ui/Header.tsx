'use client'
import * as Popover from '@radix-ui/react-popover'
import { User, Pencil, RefreshCw, ChevronDown } from 'lucide-react'
import type { Role } from './types'
import { cn } from './cn'

export function Header({
  role,
  onChangeRole,
  onNewConversation,
}: {
  role: Role
  onChangeRole: () => void
  onNewConversation: () => void
}) {
  const label = role === 'consumer' ? 'Knowledge Consumer' : 'KB Author'
  const Icon = role === 'consumer' ? User : Pencil
  const pillClasses =
    role === 'consumer'
      ? 'bg-consumer-50 text-consumer-600 border-consumer-600/40'
      : 'bg-author-50 text-author-600 border-author-600/40'

  return (
    <header className="flex items-center justify-between border-b border-neutral-border px-4 py-3">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
              pillClasses,
            )}
          >
            <Icon size={14} aria-hidden />
            {label}
            <ChevronDown size={12} aria-hidden />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="rounded-md border bg-white p-1 shadow-md"
          >
            <button
              onClick={onChangeRole}
              className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
            >
              Change role
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <button
        type="button"
        onClick={onNewConversation}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-border px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        <RefreshCw size={14} aria-hidden />
        New conversation
      </button>
    </header>
  )
}

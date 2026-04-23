'use client'
import * as Popover from '@radix-ui/react-popover'
import { User, Pencil, RefreshCw, ChevronDown, Info } from 'lucide-react'
import type { Role } from './types'
import { cn } from './cn'
import { useConfig } from './useConfig'
import { AboutPopover } from './AboutPopover'

/**
 * Freshness line sub-component.
 *
 * Desktop (<sm hidden): shows full grounding text.
 * Mobile (sm:hidden): shows abbreviated "Grounded" label only.
 * The ℹ button (rendered alongside this in Header) always opens the AboutPopover
 * which contains the full freshness/scope detail on all viewports.
 *
 * Pitfall 16: freshness line is text-only (muted grey), ℹ icon pairs with it
 * to satisfy icon+colour pairing on the trust cluster.
 */
function FreshnessLine() {
  const { config } = useConfig()
  if (!config) return null
  const { KB0022991, KB0020882, SNOW_FORM } = config.versions
  const full = `Grounded in KB0022991 v${KB0022991} · KB0020882 v${KB0020882} · Form schema ${SNOW_FORM}`
  return (
    <span
      className="hidden min-w-0 flex-1 truncate text-xs text-neutral-500 sm:block"
      aria-label={full}
      title={full}
    >
      {full}
    </span>
  )
}

export function Header({
  role,
  onChangeRole,
  onNewConversation,
  onSignOut,
}: {
  role: Role
  onChangeRole: () => void
  onNewConversation: () => void
  /**
   * Optional for Phase-3/4 unit tests that pre-date Plan 05-04. Plan 05-04
   * ChatSurface always supplies this; it triggers the sign-out confirm-dialog
   * flow when chat state is dirty, or the direct logoutRedirect when clean.
   */
  onSignOut?: () => void
}) {
  const label = role === 'consumer' ? 'Knowledge Consumer' : 'KB Author'
  const Icon = role === 'consumer' ? User : Pencil
  const pillClasses =
    role === 'consumer'
      ? 'bg-consumer-50 text-consumer-600 border-consumer-600/40'
      : 'bg-author-50 text-author-600 border-author-600/40'

  return (
    <header className="flex items-center justify-between gap-2 border-b border-neutral-border px-4 py-3">
      {/* Left: role pill popover */}
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
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                Sign out
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Centre: freshness cluster — desktop full text, mobile 'Grounded' + ℹ */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
        <FreshnessLine />
        {/* Mobile-only abbreviated label (hidden on sm and above) */}
        <span className="text-xs text-neutral-500 sm:hidden">Grounded</span>
        <AboutPopover>
          <button
            type="button"
            aria-label="About this assistant"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
          >
            <Info size={14} aria-hidden />
          </button>
        </AboutPopover>
      </div>

      {/* Right: new conversation */}
      <button
        type="button"
        onClick={onNewConversation}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-border px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        <RefreshCw size={14} aria-hidden />
        New conversation
      </button>
    </header>
  )
}

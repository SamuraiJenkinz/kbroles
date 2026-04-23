'use client'
import { Flag, Upload, Paperclip, Tags, FileText, ClipboardList } from 'lucide-react'
import type { Message as MessageType, Feedback } from './types'
import { cn } from './cn'
import { ErrorCard } from './ErrorCard'
import { AssistantControls } from './AssistantControls'
import { Timestamp } from './Timestamp'
import { getSourceBadge, badgeClassesFor, ringClassesFor } from '@/ui/sourceBadges'
import type { BadgeDef } from '@/ui/sourceBadges'

// ── Icon map at module scope (Pitfall 16: icon always paired with colour) ─────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICONS: Record<BadgeDef['iconName'], React.ComponentType<any>> = {
  Flag,
  Upload,
  Paperclip,
  Tags,
  FileText,
  ClipboardList,
}

export function Message({
  message,
  onCopy,
  onFeedback,
  onRetry,
  onChipClick,
  activeSource,
}: {
  message: MessageType
  onCopy?: (id: string) => void
  onFeedback?: (id: string, next: Feedback | null) => void
  onRetry?: (id: string) => void
  onChipClick?: (source_id: string, section_id: string) => void
  activeSource?: { source_id: string; section_id: string } | null
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
              <FileText size={14} aria-hidden />
              <span>This answer is a general response</span>
            </span>
          )}
          <p className="whitespace-pre-wrap">{message.text}</p>

          {/* Citations — colour-coded clickable chips (Pitfall 16: icon + colour always paired) */}
          {message.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.citations.map((cit) => {
                const badge = getSourceBadge(cit.source_id, cit.section_id)
                const isActive =
                  activeSource?.source_id === cit.source_id &&
                  activeSource?.section_id === cit.section_id
                const Icon = ICONS[badge.iconName]
                return (
                  <button
                    key={`${cit.source_id}-${cit.section_id}`}
                    type="button"
                    onClick={() => onChipClick?.(cit.source_id, cit.section_id)}
                    aria-label={`Open source ${cit.source_id} — ${badge.label}`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                      badgeClassesFor(badge.colour),
                      isActive && ringClassesFor(badge.colour),
                    )}
                  >
                    <Icon size={10} aria-hidden={true} />
                    {cit.source_id} · {badge.label}
                  </button>
                )
              })}
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

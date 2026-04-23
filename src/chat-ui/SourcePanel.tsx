'use client'
import { useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, ExternalLink, Flag, Upload, Paperclip, Tags, FileText, ClipboardList } from 'lucide-react'
import type { LoadedSource } from './usePanelState'
import { useSourceContent } from './useSourceContent'
import { renderSectionMarkdown } from './renderSectionMarkdown'
import { getSourceBadge, badgeClassesFor } from '@/ui/sourceBadges'
import type { BadgeDef } from '@/ui/sourceBadges'
import { cn } from './cn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICONS: Record<BadgeDef['iconName'], React.ComponentType<any>> = {
  Flag,
  Upload,
  Paperclip,
  Tags,
  FileText,
  ClipboardList,
}

function BadgeIcon({ name, size = 14 }: { name: BadgeDef['iconName']; size?: number }) {
  const Icon = ICONS[name]
  return <Icon size={size} aria-hidden={true} />
}

export function SourcePanel({
  open,
  loaded,
  onClose,
}: {
  open: boolean
  loaded: LoadedSource | null
  onClose: () => void
}) {
  const { content, loading, error } = useSourceContent(loaded)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // Scroll to cited section + replay CSS highlight on content change.
  useEffect(() => {
    if (!content || !bodyRef.current) return
    const el = bodyRef.current.querySelector<HTMLElement>(`[id="${CSS.escape(content.section_id)}"]`)
    if (!el) return
    // Guard: scrollIntoView may not be available in jsdom
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    el.removeAttribute('data-highlight')
    void el.offsetHeight  // force reflow to replay CSS animation
    el.setAttribute('data-highlight', 'true')
  }, [content])

  const badge = loaded ? getSourceBadge(loaded.source_id, loaded.section_id) : null

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }} modal={false}>
      <Dialog.Portal>
        {/* Mobile-only overlay (lg:hidden); desktop uses no overlay — chat stays interactive */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 lg:hidden" />
        <Dialog.Content
          aria-labelledby="source-panel-title"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}   // do NOT steal focus from chat input
          className={cn(
            'fixed right-0 top-0 z-50 flex h-full flex-col border-l border-neutral-border bg-white shadow-xl focus:outline-none',
            // Mobile: full-screen drawer; Desktop: 40vw pane
            'w-full max-w-full lg:w-[40vw] lg:max-w-none',
            'data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
            'transition-transform duration-200 ease-out',
          )}
        >
          {/* Header */}
          <header className="flex items-center gap-2 border-b border-neutral-border px-4 py-3">
            {badge && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  badgeClassesFor(badge.colour),
                )}
                aria-label={`Source ${loaded?.source_id} — ${badge.label}`}
              >
                <BadgeIcon name={badge.iconName} size={12} />
                {loaded?.source_id}
              </span>
            )}
            <Dialog.Title id="source-panel-title" className="flex-1 truncate text-sm font-semibold">
              {content?.title ?? loaded?.section_id ?? 'Source'}
            </Dialog.Title>
            {content && (
              <span className="shrink-0 text-xs text-neutral-500">v{content.version}</span>
            )}
            <Dialog.Close asChild>
              <button
                aria-label="Close source panel"
                className="ml-1 shrink-0 rounded p-1 text-neutral-600 hover:bg-neutral-100"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </header>

          {/* Body */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-3">
            {loading && <p className="text-sm text-neutral-500">Loading source…</p>}
            {error && <p className="text-sm text-red-600">Could not load source ({error}).</p>}
            {content && (
              <div id={content.section_id} data-section-id={content.section_id} className="rounded">
                <h2 className="mb-2 text-base font-semibold">{content.title}</h2>
                {renderSectionMarkdown(content.body)}
              </div>
            )}
          </div>

          {/* Footer */}
          {content && (
            <footer className="border-t border-neutral-border px-4 py-3">
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Open in ServiceNow
                <ExternalLink size={14} aria-hidden />
              </a>
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

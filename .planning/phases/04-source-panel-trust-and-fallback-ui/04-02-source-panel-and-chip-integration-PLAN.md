---
phase: 04-source-panel-trust-and-fallback-ui
plan: 02
type: execute
wave: 2
depends_on: [04-01]
files_modified:
  - src/chat-ui/usePanelState.ts
  - src/chat-ui/__tests__/usePanelState.test.ts
  - src/chat-ui/useSourceContent.ts
  - src/chat-ui/__tests__/useSourceContent.test.ts
  - src/chat-ui/SourcePanel.tsx
  - src/chat-ui/__tests__/SourcePanel.test.tsx
  - src/chat-ui/renderSectionMarkdown.ts
  - src/chat-ui/__tests__/renderSectionMarkdown.test.ts
  - src/chat-ui/Message.tsx
  - src/chat-ui/__tests__/Message.test.tsx
  - src/chat-ui/ChatSurface.tsx
  - src/chat-ui/__tests__/ChatSurface.test.tsx
  - src/app/globals.css
autonomous: true

must_haves:
  truths:
    - "First cited assistant response in a session auto-opens the panel to the first citation's {source_id, section_id}; subsequent cited responses update panel content without re-opening if the user closed it."
    - "Clicking any citation chip (latest message or older) opens the panel (if closed) and loads that source; the active chip gets a colour-matched ring shared with the panel badge."
    - "Panel header shows colour-coded badge + icon + section title + `${source_id} · v${version}`; panel footer shows `Open in ServiceNow ↗` link using registry url."
    - "Panel body renders the section markdown with the CITED section scrolled into view + a 2s CSS fade-highlight; unique DOM id on each section matches the REGISTRY `section_id` (NOT the heading slug — Pitfall 19)."
    - "Desktop (>=1024px) panel is Radix Dialog `modal={false}` with `onOpenAutoFocus` prevented (chat input retains focus); mobile (<1024px) is an overlay drawer via responsive CSS."
    - "Panel open/closed state persists via `sessionStorage.panel_open` (string `'true'`/`'false'`, strict equality read)."
    - "Citation chips in Message.tsx become clickable buttons using `getSourceBadge` for colour + icon (not raw grey Paperclip)."
  artifacts:
    - path: "src/chat-ui/usePanelState.ts"
      provides: "Panel state hook with auto-open-on-first-citation semantics"
      exports: ["usePanelState"]
    - path: "src/chat-ui/useSourceContent.ts"
      provides: "fetches /api/sources for the currently loaded {source_id, section_id}"
      exports: ["useSourceContent"]
    - path: "src/chat-ui/SourcePanel.tsx"
      provides: "Radix Dialog panel (desktop non-modal + mobile drawer responsive)"
      exports: ["SourcePanel"]
    - path: "src/chat-ui/renderSectionMarkdown.ts"
      provides: "Lightweight markdown → React renderer for section bodies"
      exports: ["renderSectionMarkdown"]
  key_links:
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "usePanelState + SourcePanel"
      via: "panel state wiring + first-citation auto-open + chip click handler"
      pattern: "usePanelState|autoOpenOnFirstCitation"
    - from: "src/chat-ui/Message.tsx"
      to: "src/ui/sourceBadges.ts"
      via: "citation chip colour + icon + click handler"
      pattern: "getSourceBadge|onChipClick"
    - from: "src/chat-ui/SourcePanel.tsx"
      to: "/api/sources"
      via: "fetch section body via useSourceContent"
      pattern: "fetch.*api/sources"
    - from: "src/chat-ui/SourcePanel.tsx"
      to: "REGISTRY section_id"
      via: "DOM element id={section.id} scrolled into view"
      pattern: "getElementById.*section_id|id=\\{section"
---

<objective>
Build the Source Panel (desktop persistent pane, mobile drawer) and wire citation chips to open/update it. Panel auto-opens on first cited response in a session, updates in-place on subsequent responses, re-opens on chip click even for older messages. Chips use the canonical colour+icon+ring from `sourceBadges.ts` (Plan 01), so chip and panel badge always match.

Purpose: SC #1, SC #2, SC #3 of the phase roadmap directly map to this plan. Pitfall 19 (anchor IDs from section markers, not heading slugs) is locked via `id={section.id}` from REGISTRY, and Pitfall 16 (colour+icon pairing) is enforced by Plan 01's badge helper.

Output:
- `usePanelState` hook: sessionStorage-persisted open/closed + tracked loaded `{source_id, section_id}` + `hasAutoOpened` flag so first-citation auto-open only fires once per session.
- `useSourceContent` hook: fetches `/api/sources` for the loaded pair, caches in-memory per-session map keyed on `${source_id}/${section_id}`.
- `renderSectionMarkdown`: hand-rolled renderer (no react-markdown dependency) that transforms section body into React elements, stripping the leading `## Heading` (used as panel title).
- `SourcePanel`: single component that adapts CSS between desktop non-modal pane and mobile overlay drawer; header + body + footer as specified in CONTEXT §Panel structure.
- `Message.tsx` modification: citation chips become colour-coded `<button>` elements using `getSourceBadge`; active chip gets ring.
- `ChatSurface.tsx` modification: wires panel state, observes `assistant/citations` dispatches, invokes `autoOpenOnFirstCitation` + `chipClick` handlers.
- `globals.css` addition: `@keyframes section-highlight` + `data-highlight` attribute rule.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-source-panel-trust-and-fallback-ui/04-CONTEXT.md
@.planning/phases/04-source-panel-trust-and-fallback-ui/04-RESEARCH.md
@.planning/phases/04-source-panel-trust-and-fallback-ui/04-01-source-exposure-and-badge-constants-PLAN.md

# Integration points
@src/chat-ui/ChatSurface.tsx
@src/chat-ui/Message.tsx
@src/chat-ui/types.ts
@src/chat-ui/chatReducer.ts
@src/chat-ui/ChangeRoleDialog.tsx
@src/app/globals.css
</context>

<tasks>

<task type="auto">
  <name>Task 1: Panel state hook + source content hook + markdown renderer (pure + hook logic)</name>
  <files>
    src/chat-ui/usePanelState.ts,
    src/chat-ui/__tests__/usePanelState.test.ts,
    src/chat-ui/useSourceContent.ts,
    src/chat-ui/__tests__/useSourceContent.test.ts,
    src/chat-ui/renderSectionMarkdown.ts,
    src/chat-ui/__tests__/renderSectionMarkdown.test.ts
  </files>
  <action>
Three small, independent pieces. All have clean input/output contracts — TDD-friendly, test each in isolation.

**1. `src/chat-ui/usePanelState.ts`** — panel open/closed + currently loaded source.

```typescript
'use client'
import { useCallback, useState } from 'react'

export interface LoadedSource { source_id: string; section_id: string }

const PANEL_OPEN_KEY = 'panel_open'

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(PANEL_OPEN_KEY) === 'true'  // strict equality — Pitfall from RESEARCH §sessionStorage type
}

export function usePanelState() {
  const [open, setOpenState] = useState<boolean>(readInitial)
  const [loaded, setLoaded] = useState<LoadedSource | null>(null)
  const [hasAutoOpened, setHasAutoOpened] = useState(false)

  const writeOpen = (next: boolean) => {
    if (typeof window !== 'undefined') sessionStorage.setItem(PANEL_OPEN_KEY, next ? 'true' : 'false')
    setOpenState(next)
  }

  const openPanel = useCallback((source_id: string, section_id: string) => {
    setLoaded({ source_id, section_id })
    writeOpen(true)
  }, [])

  const closePanel = useCallback(() => {
    writeOpen(false)
    // Do NOT clear `loaded` — close preserves which source was last shown (CONTEXT.md §Close behaviour)
  }, [])

  /**
   * Call on every assistant/citations dispatch. FIRST call of the session opens the
   * panel + records the source. Subsequent calls update `loaded` ONLY IF panel is
   * currently open (never re-open a panel the user closed — CONTEXT §Auto-open trigger).
   */
  const autoOpenOnFirstCitation = useCallback(
    (source_id: string, section_id: string) => {
      if (!hasAutoOpened) {
        setHasAutoOpened(true)
        setLoaded({ source_id, section_id })
        writeOpen(true)
      } else if (open) {
        setLoaded({ source_id, section_id })
      }
    },
    [hasAutoOpened, open],
  )

  /**
   * Chip click — opens the panel if closed AND loads the requested source.
   * Always updates loaded regardless of `open`.
   */
  const chipClick = useCallback((source_id: string, section_id: string) => {
    setLoaded({ source_id, section_id })
    writeOpen(true)
  }, [])

  /**
   * Call on conversation/clear (New conversation or change role) to reset
   * the first-citation-auto-open latch. Does NOT force-close the panel.
   */
  const resetSession = useCallback(() => {
    setHasAutoOpened(false)
    setLoaded(null)
  }, [])

  return { open, loaded, openPanel, closePanel, autoOpenOnFirstCitation, chipClick, resetSession }
}
```

**Test `usePanelState.test.ts`** (using `@testing-library/react` renderHook + vitest jsdom):
1. Initial state: `open===false`, `loaded===null`, `hasAutoOpened===false`, sessionStorage empty.
2. `autoOpenOnFirstCitation('A','1')` → open becomes true, loaded = {A,1}, sessionStorage['panel_open']='true'.
3. Second `autoOpenOnFirstCitation('B','2')` with panel still open → loaded updates to {B,2}, open still true.
4. `closePanel()` after auto-open → open false, loaded PRESERVED as last value (regression for CONTEXT Close behaviour).
5. After closePanel, calling `autoOpenOnFirstCitation('C','3')` → open stays FALSE, loaded NOT updated (panel respects user's explicit close).
6. `chipClick('C','3')` after closePanel → open true, loaded = {C,3} (chip always re-opens).
7. `resetSession()` → hasAutoOpened back to false, loaded=null (next citation re-arms auto-open).
8. sessionStorage value discipline: write `'true'`/`'false'` string literals (not `true`/`false` booleans).

**2. `src/chat-ui/useSourceContent.ts`** — fetches /api/sources on `loaded` change with in-memory cache.

```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
import type { LoadedSource } from './usePanelState'

export interface SectionContent {
  source_id: string
  section_id: string
  title: string
  body: string
  url: string
  version: string
}

export function useSourceContent(loaded: LoadedSource | null): {
  content: SectionContent | null
  loading: boolean
  error: string | null
} {
  const [content, setContent] = useState<SectionContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<Map<string, SectionContent>>(new Map())

  useEffect(() => {
    if (!loaded) {
      setContent(null)
      setError(null)
      return
    }
    const key = `${loaded.source_id}/${loaded.section_id}`
    const cached = cacheRef.current.get(key)
    if (cached) {
      setContent(cached)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const ctrl = new AbortController()
    fetch(`/api/sources?source_id=${encodeURIComponent(loaded.source_id)}&section_id=${encodeURIComponent(loaded.section_id)}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`http_${res.status}`)
        const json = (await res.json()) as SectionContent
        cacheRef.current.set(key, json)
        setContent(json)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(String(err))
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [loaded?.source_id, loaded?.section_id])

  return { content, loading, error }
}
```

**Test `useSourceContent.test.ts`**:
1. Initial: `content===null`, `loading===false`.
2. Set loaded={KB0020882, resolution-field-software} — fetch called with correct URL-encoded query; after resolve, content populated with fetched body.
3. Re-setting the same loaded pair → NO second fetch (cache hit).
4. Switching loaded to a different pair → new fetch; content updates.
5. Fetch failure (500 status) → `error` set, `content` remains null.
6. Unmount during fetch → AbortController.abort() called (no state update warning).

Use `vi.fn()` on `window.fetch` with per-test mock implementation.

**3. `src/chat-ui/renderSectionMarkdown.ts`** — hand-rolled renderer.

```typescript
import React from 'react'

/**
 * Transforms the REGISTRY section body markdown to React elements WITHOUT
 * adding react-markdown. Supports only the subset used by the corpus:
 *   - `## Heading` lines (dropped — used as panel title separately)
 *   - `**bold**` inline
 *   - `- item` unordered lists
 *   - `1. item` ordered lists
 *   - fenced code blocks ```...```
 *   - blank-line-separated paragraphs
 *
 * Content is trusted (our own corpus, not user input) — no XSS sanitisation needed.
 */
export function renderSectionMarkdown(body: string): React.ReactNode {
  // Drop leading `## Heading` line(s) — rendered separately in panel header
  const withoutHeading = body.replace(/^##\s+.+$\n?/m, '').trim()

  // Split into blocks by blank lines
  const blocks = withoutHeading.split(/\n{2,}/)

  return blocks.map((block, i) => renderBlock(block, i))
}

function renderBlock(block: string, key: number): React.ReactNode {
  const trimmed = block.trim()
  if (!trimmed) return null

  // Fenced code block
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    const code = trimmed.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '')
    return (
      <pre key={key} className="my-3 overflow-x-auto rounded bg-neutral-100 p-2 text-xs">
        <code>{code}</code>
      </pre>
    )
  }

  // Unordered list
  if (trimmed.split('\n').every((ln) => /^-\s+/.test(ln))) {
    return (
      <ul key={key} className="my-3 list-disc pl-5 text-sm">
        {trimmed.split('\n').map((ln, j) => (
          <li key={j} className="mb-1">{renderInline(ln.replace(/^-\s+/, ''))}</li>
        ))}
      </ul>
    )
  }

  // Ordered list
  if (trimmed.split('\n').every((ln) => /^\d+\.\s+/.test(ln))) {
    return (
      <ol key={key} className="my-3 list-decimal pl-5 text-sm">
        {trimmed.split('\n').map((ln, j) => (
          <li key={j} className="mb-1">{renderInline(ln.replace(/^\d+\.\s+/, ''))}</li>
        ))}
      </ol>
    )
  }

  // Paragraph
  return <p key={key} className="my-3 text-sm leading-relaxed">{renderInline(trimmed)}</p>
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold** tokens; every other fragment is bold.
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}
```

**Test `renderSectionMarkdown.test.ts`** (using @testing-library/react render + container queries):
1. Renders paragraph: `"Hello world"` → one `<p>` containing `"Hello world"`.
2. Strips `## Heading` line at start: `"## Heading\n\nBody"` → output has no `<h2>` and the first block is a `<p>Body</p>`.
3. Renders `**bold**` as `<strong>`.
4. Renders `- item\n- item2` as `<ul><li>item</li><li>item2</li></ul>`.
5. Renders `1. a\n2. b` as `<ol><li>a</li><li>b</li></ol>`.
6. Renders fenced `` ```\ncode\n``` `` as `<pre><code>code</code></pre>`.
7. Mixed blocks: paragraph + list + paragraph survives block separation.
8. Registry smoke test: for `REGISTRY.KB0020882.sections.find(s => s.id==='resolution-field-software').body`, `renderSectionMarkdown(body)` produces non-empty output (no crash on real corpus).
  </action>
  <verify>
pnpm typecheck && pnpm test src/chat-ui/__tests__/usePanelState.test.ts src/chat-ui/__tests__/useSourceContent.test.ts src/chat-ui/__tests__/renderSectionMarkdown.test.ts (all green)
  </verify>
  <done>
All three hooks/pure functions have green unit tests. usePanelState honours CONTEXT.md auto-open semantics (no re-open after user close). useSourceContent has in-memory cache. renderSectionMarkdown handles the 5 markdown element types present in the corpus.
  </done>
</task>

<task type="auto">
  <name>Task 2: SourcePanel component (desktop pane + mobile drawer + header/body/footer + section highlight CSS)</name>
  <files>
    src/chat-ui/SourcePanel.tsx,
    src/chat-ui/__tests__/SourcePanel.test.tsx,
    src/app/globals.css
  </files>
  <action>
Single unified `SourcePanel` component using Radix Dialog `modal={false}`. Responsive behaviour via Tailwind classes — one component renders on all viewports; CSS handles desktop-pane vs mobile-overlay variation.

**1. `src/app/globals.css`** — append the section-highlight keyframes + attribute rule AT THE END of the file:

```css
/* Phase 4: cited-section fade highlight (Pattern 4 from RESEARCH §Section Highlight). */
@keyframes section-highlight {
  0%   { background-color: rgb(254 243 199 / 0.6); }  /* amber-100/60 */
  100% { background-color: transparent; }
}

[data-highlight="true"] {
  animation: section-highlight 2s ease-out forwards;
}
```

**2. `src/chat-ui/SourcePanel.tsx`:**

```typescript
'use client'
import { useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, ExternalLink, Flag, Upload, Paperclip, Tags, FileText, ClipboardList } from 'lucide-react'
import type { LoadedSource } from './usePanelState'
import { useSourceContent } from './useSourceContent'
import { renderSectionMarkdown } from './renderSectionMarkdown'
import { getSourceBadge, badgeClassesFor, type BadgeDef } from '@/ui/sourceBadges'
import { cn } from './cn'

const ICONS = { Flag, Upload, Paperclip, Tags, FileText, ClipboardList } as const

function BadgeIcon({ name, size = 14 }: { name: BadgeDef['iconName']; size?: number }) {
  const Icon = ICONS[name]
  return <Icon size={size} aria-hidden />
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
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
```

**3. Test `SourcePanel.test.tsx`** (jsdom + @testing-library/react; docblock `// @vitest-environment jsdom`):

Mock `global.fetch` for `/api/sources`.

1. **Panel hidden when `open=false`:** no dialog content visible.
2. **Panel open loads KB0020882/resolution-field-software:** renders header badge `KB0020882` with blue classes (match `badgeClassesFor('blue')` substring); section title `Resolution Field — Software` in `Dialog.Title`; body text from mocked fetch visible.
3. **Footer `Open in ServiceNow` link** has `href=https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB0020882` (from mock), `target="_blank"`, `rel="noopener noreferrer"`.
4. **Close button emits onClose:** click the `aria-label="Close source panel"` button → `onClose` spy called.
5. **Pitfall 19 — anchor is section_id NOT heading slug:** with `loaded={KB0020882, resolution-field-software}`, the panel body contains an element with `id="resolution-field-software"` (matching REGISTRY section_id), NOT `id="resolution-field-software-heading"` or `id="software"`.
6. **Badge carries BOTH colour class AND icon:** Pitfall 16 — assert the header badge element has `bg-blue-50` class AND contains an SVG element. Repeat for a KB0022991/flagging-articles load: asserts `bg-red-50` + svg.
7. **ESC closes the dialog:** dispatch keydown `Escape` → `onClose` called (Radix handles natively; verify plumbing).
8. **`onOpenAutoFocus` prevented:** render with an external `<input data-testid="external">`; when panel opens, external input keeps focus (document.activeElement should not be inside the panel).
  </action>
  <verify>
pnpm typecheck && pnpm test src/chat-ui/__tests__/SourcePanel.test.tsx (all green)
  </verify>
  <done>
SourcePanel renders header (badge+title+version+close), body (scrolled highlighted section with registry-derived id), footer (Open in ServiceNow link). Tests prove Pitfall 19 (section_id not heading slug) + Pitfall 16 (icon+colour always paired). Mobile drawer + desktop pane differentiation handled via Tailwind lg: breakpoint classes.
  </done>
</task>

<task type="auto">
  <name>Task 3: Citation chip integration (Message.tsx) + ChatSurface wiring (panel state + chip click + conversation/clear reset)</name>
  <files>
    src/chat-ui/Message.tsx,
    src/chat-ui/__tests__/Message.test.tsx,
    src/chat-ui/ChatSurface.tsx,
    src/chat-ui/__tests__/ChatSurface.test.tsx
  </files>
  <action>
Two coordinated edits. Message.tsx turns grey `<span>` citation chips into colour-coded clickable `<button>` elements; ChatSurface.tsx wires the panel state so first-citation auto-opens, chip clicks open/reload, and conversation-clear resets the latch.

**1. `src/chat-ui/Message.tsx`** — replace the existing citation chip render (lines ~73–86) with colour-coded clickable buttons.

New signature:
```typescript
export function Message({
  message,
  onCopy,
  onFeedback,
  onRetry,
  onChipClick,            // NEW
  activeSource,           // NEW — {source_id, section_id} | null
}: {
  message: MessageType
  onCopy?: (id: string) => void
  onFeedback?: (id: string, next: Feedback | null) => void
  onRetry?: (id: string) => void
  onChipClick?: (source_id: string, section_id: string) => void
  activeSource?: { source_id: string; section_id: string } | null
}) { ... }
```

Import `{ getSourceBadge, badgeClassesFor, ringClassesFor }` from `@/ui/sourceBadges`, and `{ Flag, Upload, Paperclip, Tags, FileText, ClipboardList }` from lucide-react (plus the existing `Info`, remove the now-unused solo `Paperclip` import in the feedback block if it was the only use; keep it for the icon map).

Replace the chip block with:

```tsx
{/* Citations */}
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
          <Icon size={10} aria-hidden />
          {cit.source_id} · {badge.label}
        </button>
      )
    })}
  </div>
)}
```

Declare the `ICONS` map at module scope above the component:

```typescript
const ICONS = { Flag, Upload, Paperclip, Tags, FileText, ClipboardList } as const
```

**Test additions in `Message.test.tsx`** (extend existing file if present, else create new):
1. Citation chip renders as a `<button>` (role `button`), NOT a `<span>`.
2. Chip for KB0020882/resolution-field-software has `bg-blue-50` class AND contains an SVG element (Pitfall 16).
3. Chip for KB0022991/flagging-articles has `bg-red-50` class (red = Flagging per badge map).
4. `onChipClick` spy called with `(source_id, section_id)` on click.
5. Active chip (matches `activeSource`) has `ring-2` class; inactive chip does not.
6. `aria-label` contains human-readable badge label (from `sourceBadges.label`).

**2. `src/chat-ui/ChatSurface.tsx`** — wire panel state + chip click + conversation-clear reset.

Add imports:
```typescript
import { usePanelState } from './usePanelState'
import { SourcePanel } from './SourcePanel'
```

Add panel state inside the component:
```typescript
const panel = usePanelState()
```

**In `handleEvent` — hook into `assistant/citations`**: after the existing `dispatch({type:'assistant/citations', ...})`, add:
```typescript
if (ev.citations.length > 0) {
  const first = ev.citations[0]
  panel.autoOpenOnFirstCitation(first.source_id, first.section_id)
}
```

**In `handleNewConversation` and `handleConfirmChangeRole`** (Pitfall 13 LOCKED ORDER must be preserved) — add `panel.resetSession()` as the LAST step (after clearDraft) so the auto-open latch re-arms for the next role/session. Do NOT force-close the panel here (CONTEXT §Close behaviour: resetSession affects only loaded + hasAutoOpened, not open).

**Pass chip handler + activeSource to MessageList → Message:**
Update MessageList to accept + forward `onChipClick` and `activeSource`, then forward to Message.

In MessageList.tsx, extend props:
```typescript
onChipClick?: (source_id: string, section_id: string) => void
activeSource?: { source_id: string; section_id: string } | null
```
Pass through to `<Message ... onChipClick={onChipClick} activeSource={activeSource} />`.

In ChatSurface.tsx JSX, pass:
```tsx
<MessageList
  ...existing props...
  onChipClick={panel.chipClick}
  activeSource={panel.loaded}
/>
```

**Render `<SourcePanel>` inside the ChatSurface outer div**, AFTER the existing `<main>` and `<ChangeRoleDialog>`:

```tsx
<SourcePanel
  open={panel.open}
  loaded={panel.loaded}
  onClose={panel.closePanel}
/>
```

**Adjust layout so desktop pane shrinks chat column** (CONTEXT §Desktop layout). Wrap the existing `<div className="flex min-h-screen flex-col bg-background">` with an outer flex-row container that becomes `lg:flex-row` when panel is open:

```tsx
return (
  <div className={cn('flex min-h-screen flex-col bg-background', panel.open && 'lg:flex-row')}>
    <div className={cn('flex min-h-0 flex-1 flex-col', panel.open && 'lg:w-[60%]')}>
      <Header ... />
      <main ... />
    </div>
    <ChangeRoleDialog ... />
    <SourcePanel open={panel.open} loaded={panel.loaded} onClose={panel.closePanel} />
  </div>
)
```

**Test additions in `ChatSurface.test.tsx`** (jsdom):

Mock `/api/sources` and `/api/prompts` fetch responses. Use `getByRole('button', {name:/Open source KB0020882/i})` to find chips.

1. **First citation auto-opens the panel:** mock a chat response that includes `citations: [{source_id:'KB0020882', section_id:'resolution-field-software', quote:'...'}]`. Render ChatSurface, trigger a chip send, wait for `citations` event. Assert panel DOM (dialog aria-labelledby source-panel-title) is visible.
2. **Closing panel then second citation does NOT re-open:** after step 1, user clicks the close button; subsequent assistant response with different citations leaves panel CLOSED, `loaded` unchanged (behaviour contract).
3. **Chip click re-opens panel even after close:** after close, click an active citation chip → panel re-opens with that chip's source.
4. **Subsequent citation with panel open updates `loaded`:** first response cites A, second response cites B; panel stays open, header badge/title reflect B.
5. **Pitfall-13 ordering preserved:** after `handleConfirmChangeRole`, verify `resetSession` was called (hasAutoOpened back to false) AND `stop`, `conversation/clear`, `clearDraft` fired in original order. (Easiest check: inspect the side-effect — second chat after change role auto-opens panel again on first citation.)
6. **ActiveSource ring visual wire-up:** with panel loaded {A, 1}, the chip for {A, 1} has `ring-2` class; the chip for {B, 2} does not.
  </action>
  <verify>
pnpm typecheck && pnpm test src/chat-ui/__tests__/Message.test.tsx src/chat-ui/__tests__/ChatSurface.test.tsx (all green)
  </verify>
  <done>
Message.tsx renders colour-coded clickable chips per canonical sourceBadges map. ChatSurface auto-opens panel on first citation per session; chip clicks always re-open/reload; conversation-clear resets auto-open latch. All tests prove the semantics match CONTEXT §Auto-open trigger + §Citation-chip re-open. Pitfall 16 (icon+colour) verified by Message.test.
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` clean.
- `pnpm test` green — all new unit tests pass, all existing 369 tests remain green.
- Manual browser check (dev): send author chip "Resolution field" → panel auto-opens to KB0020882 section with blue badge + FileText icon + scrolled-to section + 2s highlight fade + Open in ServiceNow link.
- Manual browser check: close panel via X; send another chip → panel does NOT re-open; click citation chip in older message → panel re-opens to that source.
- Manual responsive check: panel at <1024px is full-screen overlay drawer (not a sidebar).
- Pitfall 19 invariant: inspect DOM of open panel → the highlighted `<div>` has `id="<section_id>"` where `<section_id>` matches REGISTRY (e.g., `id="resolution-field-software"`), NOT slugified heading text.
</verification>

<success_criteria>
- SC #1 fully covered: Author "what goes in the Resolution field?" → panel auto-opens to KB0020882/resolution-field-software with blue badge, rendered section body, Open in ServiceNow footer link.
- SC #2 fully covered: follow-up citation updates content in place; clicking an earlier message's chip re-opens and re-loads the panel.
- SC #3 fully covered: footer link uses `REGISTRY[source_id].url` (exact permalink); header badge colour-coded per `sourceBadges.ts` map.
- Pitfall 19 proven by test: section DOM id matches REGISTRY section_id, NOT heading slug.
- Pitfall 16 proven by test: every chip render has both `bg-<colour>-50` AND an SVG icon element.
- sessionStorage `panel_open` uses strict `=== 'true'` equality (no truthy-string bug).
</success_criteria>

<output>
After completion, create `.planning/phases/04-source-panel-trust-and-fallback-ui/04-02-SUMMARY.md`, noting:
- Any Radix Dialog behaviour quirks encountered (e.g., Escape key handling in non-modal mode).
- Exact markdown renderer decisions made (list nesting support? code block styling?).
- Any sessionStorage edge cases discovered during test.
- Final test count delta.
</output>

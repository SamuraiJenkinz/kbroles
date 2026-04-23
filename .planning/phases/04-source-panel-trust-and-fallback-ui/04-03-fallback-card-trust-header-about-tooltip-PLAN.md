---
phase: 04-source-panel-trust-and-fallback-ui
plan: 03
type: execute
wave: 3
depends_on: [04-01, 04-02]
files_modified:
  - src/chat-ui/types.ts
  - src/chat-ui/chatReducer.ts
  - src/chat-ui/__tests__/chatReducer.test.ts
  - src/chat-ui/FallbackCard.tsx
  - src/chat-ui/__tests__/FallbackCard.test.tsx
  - src/chat-ui/mailto.ts
  - src/chat-ui/__tests__/mailto.test.ts
  - src/chat-ui/useAboutTooltip.ts
  - src/chat-ui/__tests__/useAboutTooltip.test.ts
  - src/chat-ui/AboutPopover.tsx
  - src/chat-ui/__tests__/AboutPopover.test.tsx
  - src/chat-ui/useConfig.ts
  - src/chat-ui/__tests__/useConfig.test.ts
  - src/chat-ui/Message.tsx
  - src/chat-ui/MessageList.tsx
  - src/chat-ui/__tests__/MessageList.test.tsx
  - src/chat-ui/Header.tsx
  - src/chat-ui/__tests__/Header.test.tsx
  - src/chat-ui/ChatSurface.tsx
autonomous: true

must_haves:
  truths:
    - "Fallback assistant responses render as a dedicated `FallbackCard` component in MessageList (NOT inside Message.tsx) — three independent visual signals: amber border, amber-tinted background, CircleOff icon + bold heading, plus NO KB avatar/timestamp/feedback/copy controls."
    - "FallbackCard carries a primary `Flag this gap` anchor element (`<a href={mailtoHref}>`, styled like a button) whose href is `mailto:<CONTENT_STEWARD_EMAIL>?subject=...&body=...` URL-encoded per RFC 2368 (CRLF line breaks for Outlook compatibility). Anchor approach (not imperative `window.location.href = ...`) lets the browser's default mailto handler fire AND makes the URL assertable in Playwright via `toHaveAttribute('href', /^mailto:/)` without fragile window.location monkeypatching."
    - "Mailto body contains: Question text, Role, ISO 8601 timestamp, X-Request-Id from the SSE response headers."
    - "After click, the button label swaps to `Opened in mail client ✓` for that message's lifecycle (non-blocking ack — still clickable)."
    - "Header renders a freshness line `Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema 2026-04-23` on desktop; on mobile (<640px) shows `Grounded` with an ℹ icon that opens the same About popover."
    - "First-run About popover auto-opens once per device (localStorage `about_tooltip_seen_v1`); ℹ icon always re-opens it on click; Got it + X dismiss buttons both persist the seen flag."
    - "The fallback text in the card is sourced VERBATIM from the server's `fallback{text}` SSE event — no client-side re-wording."
  artifacts:
    - path: "src/chat-ui/FallbackCard.tsx"
      provides: "Visually distinct fallback card — NOT styled like a Message (Pitfall 20)"
      exports: ["FallbackCard"]
    - path: "src/chat-ui/mailto.ts"
      provides: "Pure mailto URL builder (RFC 2368 + Outlook CRLF)"
      exports: ["buildFlagGapMailto"]
    - path: "src/chat-ui/useAboutTooltip.ts"
      provides: "First-run localStorage-gated About popover state"
      exports: ["useAboutTooltip"]
    - path: "src/chat-ui/AboutPopover.tsx"
      provides: "Radix Popover for About tooltip (auto-open + click-to-reopen)"
      exports: ["AboutPopover"]
    - path: "src/chat-ui/useConfig.ts"
      provides: "Fetches /api/config versions + contentStewardEmail"
      exports: ["useConfig", "ConfigData"]
  key_links:
    - from: "src/chat-ui/MessageList.tsx"
      to: "src/chat-ui/FallbackCard.tsx"
      via: "fallback-state branch renders FallbackCard instead of Message"
      pattern: "FallbackCard"
    - from: "src/chat-ui/FallbackCard.tsx"
      to: "src/chat-ui/mailto.ts"
      via: "renders `<a href={buildFlagGapMailto(...)}>` (not imperative window.location assignment — lets the browser's mailto handler fire and makes the URL Playwright-assertable without monkeypatching)"
      pattern: "buildFlagGapMailto"
    - from: "src/chat-ui/Header.tsx"
      to: "src/chat-ui/useConfig.ts + src/chat-ui/AboutPopover.tsx"
      via: "freshness line reads useConfig().versions; ℹ button renders AboutPopover"
      pattern: "useConfig|AboutPopover"
    - from: "src/chat-ui/useAboutTooltip.ts"
      to: "localStorage 'about_tooltip_seen_v1'"
      via: "read on mount, write on dismiss"
      pattern: "about_tooltip_seen_v1"
---

<objective>
Deliver the three trust-and-transparency affordances: a visually-distinct fallback card with a working flag-a-gap mailto, a freshness line in the chat header, and a first-run About popover. All three share the same `/api/config` data pipe (Plan 01's route).

Purpose: SC #4 and SC #5 of the phase roadmap, plus Pitfall 20 (fallback-visually-distinct) and Pitfall 16 (icon+colour pairing on the freshness indicator).

Output:
- `FallbackCard.tsx` — independent component rendered by MessageList for `state === 'fallback'` messages; three visual signals + flag-a-gap button.
- `mailto.ts` — pure builder for the mailto URL (testable in Node, no browser dependency).
- `useAboutTooltip.ts` — localStorage-gated first-run popover state.
- `AboutPopover.tsx` — Radix Popover with three-bullet content + Got-it + X dismiss.
- `useConfig.ts` — single fetch to `/api/config` used by freshness line + flag-a-gap recipient.
- `Header.tsx` — appends freshness line + ℹ button + About popover.
- `Message.tsx` — removes the existing `isFallback` branch (moves to MessageList).
- `MessageList.tsx` — adds fallback-state branch that renders FallbackCard.
- `types.ts` + `chatReducer.ts` — extend assistant message with `requestId` on fallback state (currently only on error), and the reducer passes it through `assistant/fallback` action.
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
@src/chat-ui/Message.tsx
@src/chat-ui/MessageList.tsx
@src/chat-ui/Header.tsx
@src/chat-ui/ChatSurface.tsx
@src/chat-ui/chatReducer.ts
@src/chat-ui/types.ts
@src/chat-ui/useChatStream.ts
@src/grounding/fallback.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pure primitives — mailto builder + useConfig + useAboutTooltip + types/reducer requestId plumbing</name>
  <files>
    src/chat-ui/mailto.ts,
    src/chat-ui/__tests__/mailto.test.ts,
    src/chat-ui/useConfig.ts,
    src/chat-ui/__tests__/useConfig.test.ts,
    src/chat-ui/useAboutTooltip.ts,
    src/chat-ui/__tests__/useAboutTooltip.test.ts,
    src/chat-ui/types.ts,
    src/chat-ui/chatReducer.ts,
    src/chat-ui/__tests__/chatReducer.test.ts
  </files>
  <action>
All pure / hook-level primitives before UI composition. Each testable in isolation.

**1. `src/chat-ui/mailto.ts`** — RFC 2368 + Outlook CRLF-safe mailto builder.

```typescript
/**
 * Build a mailto: URL for FBK-04 flag-a-gap workflow.
 *
 * RFC 2368 + Outlook compatibility:
 *   - encodeURIComponent() (NOT encodeURI) — spaces → %20, encodes ?,=,&,#.
 *   - Body line breaks use %0D%0A (CRLF) — Outlook on Windows renders %0A
 *     (LF alone) as literal \n in some configurations.
 */
export interface FlagGapParams {
  email: string
  question: string
  role: 'consumer' | 'author'
  requestId: string
  timestamp?: string   // ISO 8601; defaults to new Date().toISOString()
}

export function buildFlagGapMailto(params: FlagGapParams): string {
  const { email, question, role, requestId, timestamp = new Date().toISOString() } = params
  const subject = `KB Assistant: unanswered question (role: ${role})`
  const bodyLines = [
    'Question:',
    question,
    '',
    `Role: ${role}`,
    `Timestamp: ${timestamp}`,
    `Request ID: ${requestId}`,
  ]
  const body = bodyLines.join('\r\n')
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
```

**Test `mailto.test.ts`:**
1. Returns a string starting with `mailto:kb-knowledge-team@mmc.com?`.
2. Subject encoded: `subject=KB%20Assistant...` contains `%20` for spaces and role appended as-is (`role%3A%20author` or similar).
3. Body encoded: `%0D%0A` appears between lines (verify exactly, not `%0A` alone).
4. Question text with `&`, `=`, `?` characters is preserved via `encodeURIComponent` (e.g. `"A & B=C?"` → `A%20%26%20B%3DC%3F`).
5. Fixed timestamp input (`'2026-04-23T10:00:00.000Z'`) produces deterministic output — snapshot compare.
6. All 4 body fields present in decoded body after `decodeURIComponent`: `Question:`, the question text, `Role: author`, `Timestamp: 2026-04-23...`, `Request ID: req-xyz`.

**2. `src/chat-ui/useConfig.ts`** — single-fetch hook for `/api/config`.

```typescript
'use client'
import { useEffect, useState } from 'react'

export interface ConfigData {
  versions: { KB0022991: string; KB0020882: string; SNOW_FORM: string }
  contentStewardEmail: string
}

let _cache: ConfigData | null = null

export function useConfig(): { config: ConfigData | null; error: string | null } {
  const [config, setConfig] = useState<ConfigData | null>(_cache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (_cache) return
    const ctrl = new AbortController()
    fetch('/api/config', { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`http_${res.status}`)
        const json = (await res.json()) as ConfigData
        _cache = json
        setConfig(json)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(String(err))
      })
    return () => ctrl.abort()
  }, [])

  return { config, error }
}

// Test-only cache reset
export function __resetConfigCacheForTests(): void {
  _cache = null
}
```

**Test `useConfig.test.ts`**:
1. Returns `{config:null, error:null}` initially.
2. After fetch resolves → `config` populated with fetched JSON.
3. Multiple component mounts share module-level cache (only one fetch call total across two renderHook invocations).
4. Fetch failure (500) → `error` set, `config` null.
5. `__resetConfigCacheForTests()` clears cache between tests.

**3. `src/chat-ui/useAboutTooltip.ts`** — localStorage first-run state.

```typescript
'use client'
import { useCallback, useEffect, useState } from 'react'

const SEEN_KEY = 'about_tooltip_seen_v1'

export function useAboutTooltip() {
  // Default seen=true prevents SSR/hydration flash (RESEARCH Pattern 8).
  const [seen, setSeen] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const isSeen = typeof window !== 'undefined'
      && localStorage.getItem(SEEN_KEY) === 'true'
    setSeen(isSeen)
    if (!isSeen) setOpen(true)
  }, [])

  const dismiss = useCallback(() => {
    setOpen(false)
    setSeen(true)
    if (typeof window !== 'undefined') localStorage.setItem(SEEN_KEY, 'true')
  }, [])

  const reopen = useCallback(() => setOpen(true), [])

  return { open, setOpen, dismiss, reopen, seen }
}
```

**Test `useAboutTooltip.test.ts`**:
1. With localStorage empty, after mount: `open===true`, `seen===false`.
2. With localStorage `about_tooltip_seen_v1='true'`: after mount `open===false`, `seen===true` (no flash).
3. `dismiss()` → sets open false, seen true, localStorage value 'true'.
4. `reopen()` → sets open true regardless of seen.
5. Default seen=true prevents SSR flash (check initial state before effect runs — simulated by inspecting initial hook state).

**4. `src/chat-ui/types.ts` + `src/chat-ui/chatReducer.ts`** — add `requestId` to the fallback-state assistant message.

In `types.ts`, the assistant message type already has `requestId?: string` on error. Current behaviour puts it there only for `state === 'error'`. Extend so `requestId` is also stamped on `state === 'fallback'`:

- Update `ChatAction` for `'assistant/fallback'` to include `requestId`:
  ```typescript
  | { type: 'assistant/fallback'; id: string; text: string; requestId: string }
  ```

- Update `chatReducer` `assistant/fallback` case to set `requestId: action.requestId` alongside the existing fields.

- The `Message` type's assistant variant already has `requestId?: string`; no change needed there.

**Test `chatReducer.test.ts`** (extend existing file) — add a case asserting that after `assistant/fallback` dispatch with `requestId: 'req-xyz'`, the resulting message has `state: 'fallback'`, `text` set, AND `requestId: 'req-xyz'`.

NOTE: ChatSurface.tsx's `handleEvent` already receives `requestId` (second param); it will be updated in Task 3 to pass it through the `assistant/fallback` dispatch. Ensure the chatReducer test proves the wiring is ready.
  </action>
  <verify>
pnpm typecheck && pnpm test src/chat-ui/__tests__/mailto.test.ts src/chat-ui/__tests__/useConfig.test.ts src/chat-ui/__tests__/useAboutTooltip.test.ts src/chat-ui/__tests__/chatReducer.test.ts (all green)
  </verify>
  <done>
mailto builder produces deterministic RFC-2368 + Outlook-compatible URLs. useConfig caches /api/config across renders. useAboutTooltip defaults seen=true (no SSR flash) and toggles via localStorage. chatReducer propagates requestId through assistant/fallback. All tests green.
  </done>
</task>

<task type="auto">
  <name>Task 2: FallbackCard component + MessageList branch + Message.tsx cleanup</name>
  <files>
    src/chat-ui/FallbackCard.tsx,
    src/chat-ui/__tests__/FallbackCard.test.tsx,
    src/chat-ui/MessageList.tsx,
    src/chat-ui/__tests__/MessageList.test.tsx,
    src/chat-ui/Message.tsx
  </files>
  <action>
Build the visually-distinct FallbackCard and wire MessageList to render it for fallback-state messages (replacing Message's internal fallback branch).

**1. `src/chat-ui/FallbackCard.tsx`** — three visual signals + flag-a-gap button.

```typescript
'use client'
import { useState } from 'react'
import { CircleOff, Mail, Check } from 'lucide-react'
import type { Message } from './types'
import type { Role } from './types'
import { buildFlagGapMailto } from './mailto'
import { cn } from './cn'

/**
 * Visually distinct fallback — NOT a styled Message.
 * Pitfall 20 three signals:
 *   1. amber border
 *   2. amber-tinted background
 *   3. CircleOff icon + bold heading (vs normal prose)
 * Pitfall 16 (icon+colour pair): every amber element carries the CircleOff icon.
 *
 * NO avatar, timestamp, feedback, or copy controls — this is not an answer.
 */
export function FallbackCard({
  message,
  role,
  contentStewardEmail,
  userQuestion,
}: {
  message: Extract<Message, { kind: 'assistant' }>
  role: Role
  contentStewardEmail: string
  userQuestion: string
}) {
  const [flagged, setFlagged] = useState(false)

  // Build the mailto URL on render — rendering as an `<a href={...}>` (NOT
  // imperative `window.location.href = href`) makes the URL assertable via
  // Playwright `toHaveAttribute('href', ...)` without any window.location
  // monkeypatching (which is unreliable in Chromium because window.location
  // is non-configurable in real browsers).
  const mailtoHref = buildFlagGapMailto({
    email: contentStewardEmail,
    question: userQuestion,
    role,
    requestId: message.requestId ?? 'unknown',
  })

  const handleClick = () => {
    // Let the browser's default mailto handler fire (don't preventDefault).
    // onClick is purely for the UX state swap to the "Opened ✓" label.
    setFlagged(true)
  }

  return (
    <div
      role="region"
      aria-label="Fallback response"
      className={cn(
        // Signal 1: amber border (1px solid)
        'mx-4 rounded-lg border border-amber-400 dark:border-amber-600',
        // Signal 2: amber-tinted background
        'bg-amber-50 dark:bg-amber-950/20',
        // Spacing
        'p-4',
      )}
    >
      <div className="flex items-start gap-2">
        {/* Signal 3a: CircleOff icon (Pitfall 16 — never colour alone) */}
        <CircleOff size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="flex-1">
          {/* Signal 3b: bold heading (Pitfall 20 — typographic weight signal) */}
          <h3 className="mb-1 text-sm font-bold text-amber-900 dark:text-amber-200">
            Outside my knowledge
          </h3>
          {/* Verbatim server-supplied §15 text */}
          <p className="text-sm text-amber-950 dark:text-amber-100 whitespace-pre-wrap">
            {message.text}
          </p>
          <a
            href={mailtoHref}
            onClick={handleClick}
            className={cn(
              'mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-700 bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm no-underline',
              'hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500',
            )}
            aria-label="Flag this gap to the CTSS Knowledge team"
          >
            {flagged ? (
              <>
                <Check size={14} aria-hidden />
                Opened in mail client
              </>
            ) : (
              <>
                <Mail size={14} aria-hidden />
                Flag this gap
              </>
            )}
          </a>
        </div>
      </div>
    </div>
  )
}
```

**Test `FallbackCard.test.tsx`:**
1. **Pitfall 20 — three visual signals simultaneously:**
   - Container has `border-amber-400` class (signal 1).
   - Container has `bg-amber-50` class (signal 2).
   - CircleOff SVG present (signal 3a icon) AND heading has `font-bold` class (signal 3b typographic weight).
2. **Pitfall 16 — colour never alone:** for every `text-amber-*` or `bg-amber-*` element, assert an SVG child (icon) is present.
3. **Verbatim fallback text:** render with a message whose text is the exact FALLBACK_STRING constant (imported from `@/grounding/fallback`); the `<p>` contains that exact text character-for-character.
4. **Not styled like Message:** assert NO element contains `KB` avatar text, NO `<time>` element, NO `role="button"` named `/helpful|not helpful|copy/i`.
5. **Flag link renders as an `<a>` (role=link) and is primary-styled** (bg-amber-600 + text-white). Assert `getByRole('link', { name: /Flag this gap/i })` is present (NOT `role=button`).
6. **Anchor href is a mailto: URL containing the user question + role.** Assert the link element `toHaveAttribute('href', /^mailto:/)` and that `decodeURIComponent(link.getAttribute('href'))` contains the user question text AND `Role: <role>`. No `window.location` stubbing needed — the anchor href is part of the DOM.
7. **After click: label swaps to `Opened in mail client` with `Check` icon instead of Mail icon.** Link remains clickable (not disabled); `href` still points to the mailto URL. The onClick handler does NOT call `preventDefault()` — default browser mailto behaviour fires.
8. **Accessibility: `role="region"` + `aria-label="Fallback response"` on outer container.** Link has `aria-label` containing "Flag this gap".

**2. `src/chat-ui/MessageList.tsx`** — add fallback branch + pipe role/email/userQuestion.

New props on MessageList:
```typescript
role: Role
contentStewardEmail: string
```

Before the existing TypingDots/Message branch, ADD (right after the early return for empty messages):

```tsx
{messages.map((m, idx) => {
  // Plan 04 Task 2: fallback renders as dedicated FallbackCard (not Message).
  if (m.kind === 'assistant' && m.state === 'fallback') {
    // Find the user question immediately before this fallback
    const prior = messages.slice(0, idx).reverse().find(x => x.kind === 'user')
    const userQuestion = prior && prior.kind === 'user' ? prior.text : ''
    return (
      <FallbackCard
        key={m.id}
        message={m}
        role={role}
        contentStewardEmail={contentStewardEmail}
        userQuestion={userQuestion}
      />
    )
  }
  // ... existing TypingDots branch + default Message render
})}
```

Plan 02 (wave 2) has already added `onChipClick` + `activeSource` props to `MessageList` and the default `<Message>` render — this plan runs in wave 3, so those props WILL be present in the file on disk. Keep those props wired through to the default `<Message>` render. Do NOT re-add them. This plan's ONLY additions to MessageList are the new `role` and `contentStewardEmail` props, the fallback-state branch that renders `<FallbackCard>`, and the preceding-user-question extraction logic.

**Test `MessageList.test.tsx`** (extend or create):
1. Renders FallbackCard for a message with `state:'fallback'` (verify by test-id or querying for `role="region"` with aria-label fallback-response).
2. Fallback DOES NOT render KB avatar, timestamp, or feedback buttons.
3. userQuestion extraction: with a user message then a fallback, the FallbackCard receives the preceding user text.

**3. `src/chat-ui/Message.tsx`** — REMOVE the existing fallback branch.

Delete:
- The `isFallback` const (line ~47).
- The `isFallback && 'border-l-4 border-warning-600 pl-3'` cn fragment (line ~61).
- The `{isFallback && (...)}` block rendering `<Info size={14} ...> This answer is a general response` (lines ~64–69).
- The `Info` import if no longer used elsewhere in this file.
- Update `showControls` — previously `done || fallback`; now just `state === 'done'`. Fallback no longer renders controls because FallbackCard replaces the whole bubble.

Remove the now-unused imports (`Info`). Run typecheck to surface any remaining references.

**Update existing Message tests** that assert the fallback-within-Message behaviour — they should be moved/adapted to FallbackCard.test.tsx or updated to reflect the new behaviour (if a test expects an "Info" icon inside the bubble, it must now expect no such icon, and the corresponding case should be covered in FallbackCard.test.tsx instead).
  </action>
  <verify>
pnpm typecheck && pnpm test src/chat-ui/__tests__/FallbackCard.test.tsx src/chat-ui/__tests__/MessageList.test.tsx src/chat-ui/__tests__/Message.test.tsx (all green) — existing Message tests may need minor updates to match the new render path.
  </verify>
  <done>
FallbackCard renders with three independent visual signals (border + bg + icon/bold heading) + NO message affordances. MessageList routes fallback-state messages to FallbackCard; Message.tsx no longer handles fallback. Flag link is an `<a href={mailtoHref}>` with correct RFC-encoded body; default browser mailto handler fires on click. Pitfall 20 + Pitfall 16 provable via tests.
  </done>
</task>

<task type="auto">
  <name>Task 3: Trust header (freshness line + About popover) + ChatSurface wiring</name>
  <files>
    src/chat-ui/AboutPopover.tsx,
    src/chat-ui/__tests__/AboutPopover.test.tsx,
    src/chat-ui/Header.tsx,
    src/chat-ui/__tests__/Header.test.tsx,
    src/chat-ui/ChatSurface.tsx
  </files>
  <action>
Wire freshness indicator + About tooltip + ChatSurface-level passing of requestId + contentStewardEmail through the message tree.

**1. `src/chat-ui/AboutPopover.tsx`** — Radix Popover with three-bullet content + Got-it + X dismiss.

```typescript
'use client'
import * as Popover from '@radix-ui/react-popover'
import { useAboutTooltip } from './useAboutTooltip'
import { Info, X } from 'lucide-react'
import { cn } from './cn'

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
            'z-50 w-[320px] max-w-[90vw] rounded-md border border-neutral-border bg-white p-4 shadow-lg',
          )}
          aria-labelledby="about-popover-title"
        >
          <div className="mb-2 flex items-start justify-between">
            <h3 id="about-popover-title" className="flex items-center gap-1.5 text-sm font-semibold">
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
              flagging procedures (KB0022991), knowledge-article lifecycle (KB0020882), and article form-field guidance.
            </li>
            <li>
              <strong className="font-semibold text-neutral-900">What I can't:</strong>{' '}
              anything outside those three sources, personal account info, or real-time status.
            </li>
            <li>
              <strong className="font-semibold text-neutral-900">How to flag a gap:</strong>{' '}
              when I can't answer, use the "Flag this gap" button on the fallback card.
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
```

**Test `AboutPopover.test.tsx`** (jsdom; use `Popover.Root` rendered inline without needing provider wrapping since Popover is uncontrolled internally):

Use `beforeEach` to `localStorage.clear()` + `__resetAboutSeenForTests` if needed.

1. **First-run auto-open:** render with empty localStorage; after mount effect, popover content is visible (`role="dialog"` with aria-labelledby about-popover-title).
2. **Content has three bullets:** list contains "What I can answer", "What I can't", "How to flag a gap".
3. **Got it button dismisses:** click "Got it" → popover closes AND localStorage `about_tooltip_seen_v1 === 'true'`.
4. **X button dismisses:** click the Dismiss button → popover closes + localStorage set.
5. **Repeat render after localStorage seeded:** popover content NOT visible on mount (seen-flag respected).
6. **Manual open via trigger:** render with seeded localStorage, then simulate click on the trigger (passed as children) → popover opens (click-access always available).

**2. `src/chat-ui/Header.tsx`** — add freshness line + ℹ icon + About popover.

Extend props + import useConfig + AboutPopover:

```typescript
import { useConfig } from './useConfig'
import { AboutPopover } from './AboutPopover'
import { User, Pencil, RefreshCw, ChevronDown, Info } from 'lucide-react'
```

Add a `FreshnessLine` sub-component (or inline) that reads `useConfig`:

```typescript
function FreshnessLine() {
  const { config } = useConfig()
  if (!config) return null
  const { KB0022991, KB0020882, SNOW_FORM } = config.versions
  const full = `Grounded in KB0022991 v${KB0022991} · KB0020882 v${KB0020882} · Form schema ${SNOW_FORM}`
  return (
    <span
      className="hidden truncate text-xs text-neutral-500 sm:inline"
      aria-label={full}
      title={full}
    >
      {full}
    </span>
  )
}
```

Update the Header JSX — keep the existing role pill + New conversation, add the freshness cluster in the middle:

```tsx
<header className="flex items-center justify-between gap-2 border-b border-neutral-border px-4 py-3">
  <Popover.Root>
    {/* ... existing role pill ... */}
  </Popover.Root>

  {/* Freshness cluster — desktop shows full text, mobile shows 'Grounded' + ℹ */}
  <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
    <FreshnessLine />
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

  <button
    type="button"
    onClick={onNewConversation}
    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-border px-3 py-1.5 text-sm hover:bg-neutral-50"
  >
    <RefreshCw size={14} aria-hidden />
    New conversation
  </button>
</header>
```

**Test `Header.test.tsx`** (extend existing):
1. Mock `/api/config` fetch to return `{versions:{KB0022991:'13.0', KB0020882:'9.0', SNOW_FORM:'2026-04-23'}, contentStewardEmail:'x@y.com'}`.
2. Desktop viewport simulation (or just direct assertion on the rendered string since CSS visibility is not verifiable in jsdom): freshness element exists with text `Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema 2026-04-23` (exact SC #5 format).
3. ℹ button present with aria-label `About this assistant`.
4. First-run auto-open of About popover: with empty localStorage, after mount effects, popover content visible (three bullets rendered).
5. Clicking ℹ re-opens popover after it was dismissed.

**3. `src/chat-ui/ChatSurface.tsx`** — wire in useConfig + requestId through fallback dispatch + forward role/email to MessageList.

Add imports:
```typescript
import { useConfig } from './useConfig'
```

Fetch config:
```typescript
const { config } = useConfig()
```

Update the `handleEvent` fallback case to pass `requestId`:
```typescript
case 'fallback':
  dispatch({ type: 'assistant/fallback', id, text: ev.text, requestId })
  asstIdRef.current = null
  break
```

Pass `role` + `contentStewardEmail` down to MessageList:
```tsx
<MessageList
  messages={state.messages}
  inFlightId={state.inFlightId}
  role={role}
  contentStewardEmail={config?.contentStewardEmail ?? 'kb-knowledge-team@mmc.com'}
  onChipClick={panel.chipClick}
  activeSource={panel.loaded}
  onCopy={...}
  onFeedback={handleFeedback}
  onRetry={handleRetry}
/>
```

**Test ChatSurface.test.tsx** (extend from Plan 02):
- After fallback SSE event + `requestId: 'req-abc-123'`, assert the intermediate wiring contract: `state.messages.at(-1)?.requestId === 'req-abc-123'` (expose the reducer state via a test-only harness prop or via a `data-testid` attribute carrying the id, or via importing the reducer and feeding the same action sequence). This proves the `requestId` propagated from SSE header → `handleEvent` → `assistant/fallback` dispatch → reducer state → message object — independent of the mailto URL end-result.
- After the same fallback SSE scenario, assert that the rendered FallbackCard's Flag link `toHaveAttribute('href', /Request%20ID%3A%20req-abc-123/)` (the end-to-end confirmation that the same requestId made it all the way into the encoded mailto body).
- Freshness line visible in header area.
- Flag link successfully constructs a mailto URL with the server-provided requestId (verified via `href` attribute, not via `window.location` stub).
  </action>
  <verify>
pnpm typecheck && pnpm test src/chat-ui/__tests__/AboutPopover.test.tsx src/chat-ui/__tests__/Header.test.tsx src/chat-ui/__tests__/ChatSurface.test.tsx (all green)
  </verify>
  <done>
AboutPopover auto-opens on first run, dismisses via Got-it or X, re-opens on ℹ click. Header freshness line reads exact SC #5 format from useConfig. ChatSurface pipes requestId into fallback dispatches so Flag button's mailto contains the correct correlation ID.
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` clean.
- `pnpm test` green (all existing tests + new tests pass).
- Manual browser (dev): empty localStorage → land on chat surface → About popover auto-opens with three bullets. Dismiss via Got-it → popover closes, reload page → popover does NOT re-open.
- Manual browser: click ℹ icon → popover re-opens.
- Manual browser: send a consumer question "what's the capital of France?" → fallback card renders with amber border, amber background, CircleOff icon + bold heading + §15 copy + Flag this gap button. Click button → mailto URL opens (either mail client launches or a browser prompt appears); URL contains the question + role + timestamp + request id.
- Visual: freshness line at top of chat reads `Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema 2026-04-23`.
- Pitfall 20 invariant: take a screenshot of a fallback card + a normal grounded answer; cards are visibly distinct to colour-blind users (amber is distinct from neutral grey) AND in grayscale (bold heading + icon + border preserve the signal).
</verification>

<success_criteria>
- SC #4: out-of-scope question → fallback card with exact §15 copy, amber border + icon + bold-heading treatment, Flag button pre-populates mailto with question + role + timestamp + request id.
- SC #5: freshness line text = `Grounded in KB0022991 v{v1} · KB0020882 v{v2} · Form schema {v3}`; first-run About popover covers the three bullets specified.
- Pitfall 20 enforced: FallbackCard.test asserts all three visual signals present simultaneously; no KB-avatar/timestamp/feedback/copy in the render.
- Pitfall 16 enforced: every amber element in FallbackCard has a paired icon; freshness line carries the ℹ icon alongside the colour (grey muted text with icon visible).
- Flag link's `href` attribute is built by the pure `buildFlagGapMailto` builder — no ad-hoc URL assembly in the component, no imperative `window.location` mutation.
</success_criteria>

<output>
After completion, create `.planning/phases/04-source-panel-trust-and-fallback-ui/04-03-SUMMARY.md`, noting:
- Any browser-specific mailto quirks encountered (Outlook on Windows vs Apple Mail line break rendering).
- Exact test-count delta.
- Whether localStorage reset across tests required a new helper.
- Any decisions about freshness-line mobile UX (the AboutPopover opened from the ℹ icon doubles as the "full freshness list" revelation affordance on mobile).
</output>

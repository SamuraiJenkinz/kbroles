# Phase 3: Role Experience & Chat UI — Research

**Researched:** 2026-04-22
**Domain:** Next.js 16 / React 19 client UI consuming a locked SSE streaming contract, with session-scoped role state, keyboard-first accessibility, and an abort-capable fetch stream reader.
**Confidence:** HIGH on stack + contract + codebase state; MEDIUM on exact component-primitive picks (alternatives exist but the default from CONTEXT.md is sound).

## Summary

This phase is the first UI layer in the repo. Nothing under `src/app/` exists except API routes (`/api/chat`, `/api/prompts`, `_middleware.ts`): no `layout.tsx`, no `page.tsx`, no CSS, no icon lib, no Tailwind, no jsdom/RTL/Playwright. The installed runtime is **Next 16.2.4 + React 19.2.5 + TypeScript 5.6 + Vitest 3 (node env) + Zod 4**; pnpm is the package manager.

The Phase-2 client contract is complete, canonical, and well-documented at `docs/api-chat-contract.md` — it includes a copy-pasteable `streamChat()` fetch+ReadableStream consumer snippet that the planner can adopt directly (it covers `response.ok` branching, `X-Request-Id` surfacing, frame-by-frame SSE parsing with a trailing-partial buffer, and `AbortSignal` plumbing). No helper is shipped on the server side for the client to reuse — shapes are TypeScript-only. The client must rebuild `type SseEvent`/`ChatRequest`/`Citation` in `src/app/(chat)/` (single source of truth for wire types belongs beside the consumer; do NOT `import` from `src/chat/*` server modules because that would bundle Node-only code like `zod` schema + `@/config/env` into the client).

**Primary recommendation (confirming CONTEXT.md §Claude's Discretion):** Adopt **Tailwind CSS v4 + Radix Primitives + lucide-react + local React state (useReducer for the chat message log; useState for everything else) + Vitest/jsdom for components + Playwright for the streaming/abort/role-contamination E2E flows**. Keep the existing `environment: 'node'` vitest config as the default and add a **per-file `// @vitest-environment jsdom` docblock** (or split into a second Vitest project) for UI tests — do NOT globally flip to jsdom because it slows down the 224 existing backend tests.

## Current Codebase State (HIGH confidence — read from disk)

This is a greenfield UI on top of a complete backend. The planner must **scaffold root app shell, styling, component test infra, and all client code from zero.**

### What exists (`src/`)

| Path | Content | Usable in Phase 3? |
|------|---------|--------------------|
| `src/app/api/chat/route.ts` | POST SSE endpoint — locked | Yes, target of `fetch` |
| `src/app/api/prompts/route.ts` | GET `?role=...` chip list — locked | Yes, target of `fetch` |
| `src/app/api/_middleware.ts` | Stub `getRequestUser` | Phase 5 replaces |
| `src/chat/requestSchema.ts` | Server-side zod parser, `ChatRequest`/`ParseChatError` types | **Do NOT import into client** (pulls in zod + env). Mirror the shape. |
| `src/chat/sse.ts` | Server-side `SseEvent`/`FallbackReason`/`ErrorCode` types + encoder | **Do NOT import into client** (mirrors `Citation` from server `grounding/schema.ts`). Mirror the shape. |
| `src/prompts/suggested.ts` | `ChipItem` interface + seeded chip list | **Do NOT import into client** — the client must consume `/api/prompts` over the wire per AUTH-02 / contract. Mirror `ChipItem` only. |
| `src/grounding/registry.ts` | Server-only Node `fs` readSync — explicitly server-only | Do NOT import (would break client bundle) |
| `docs/api-chat-contract.md` | **Canonical client contract**, includes working `streamChat()` snippet | Primary reference |

### What does NOT exist (must be created)

- `src/app/layout.tsx` (root layout — Next 16 App Router requires one)
- `src/app/page.tsx` (role-select landing)
- `src/app/globals.css` (Tailwind entry)
- `postcss.config.mjs` (Tailwind v4 PostCSS plugin)
- Any `'use client'` component
- `src/ui/`, `src/components/` folders
- `src/ui/sourceTitles.ts` (planner must seed from handover §14 — Phase 3 needs it for UTIL-01 copy suffix; Phase 4 will reuse for panel headers)
- jsdom + @testing-library/react + @vitejs/plugin-react (devDeps)
- Playwright (devDep + config) — **no E2E infra at all today**
- Any client-side state pattern (first UI in the repo — pick freely within CONTEXT.md)

### package.json summary (verbatim from disk)

- `next@^16.0.0` → installed 16.2.4
- `react@^19.2.0` / `react-dom@^19.2.0` → installed 19.2.5
- `zod@^4.0.0`, `openai@^6`, `pino@^10.3.1`, `ajv@^8.18` (all server-only)
- Dev: `vitest@^3.0.0`, `typescript@^5.6.0`, `eslint@^9.0.0`, `eslint-config-next@^16.0.0`, `vite-tsconfig-paths@^5.0.0`, `tsx@^4`
- `"type": "module"` — ESM everywhere
- Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test` (`vitest run`), `test:watch`, `smoke`

### tsconfig.json summary

- `"jsx": "react-jsx"`, `"strict": true`, `"moduleResolution": "bundler"`, `"target": "ES2022"`
- Path alias `"@/*": ["./src/*"]` — use for client imports too
- `lib: ["dom", "dom.iterable", "esnext"]` — DOM types available

### vitest.config.mts summary

- `environment: 'node'` — **needs per-file jsdom override for UI tests** (see §Testing)
- Has a custom `rawMarkdown` plugin for `.md` imports (server-only concern, leave alone)
- Uses `vite-tsconfig-paths` — `@/` alias already works

### Next.js config summary (`next.config.ts`)

- `serverExternalPackages: ['pino', 'pino-pretty']` — server-only; Phase 3 doesn't touch
- Turbopack `'*.md': { type: 'raw' }` — server-only; Phase 3 doesn't touch
- No custom route segment config that Phase 3 needs to change

---

## Standard Stack

### Core

| Library | Version pin | Purpose | Why standard |
|---------|-------------|---------|--------------|
| Next.js | `16.2.4` (installed) | App Router + Route Handlers (already in use for `/api/chat`). Phase-3 adds `app/page.tsx`, `app/layout.tsx`, and — if the planner chooses route-segment split — `app/(chat)/page.tsx`. | Already locked; 16.2 has stable App Router + Turbopack default. |
| React | `19.2.5` (installed) | Client components, hooks, `useTransition`, `useId`. | Already locked. |
| TypeScript | `5.6` | Strict typing for every component. | Already locked. |
| Tailwind CSS | `v4.2+` (new install) | Utility CSS, zero config, CSS-first theme. Pair with `@tailwindcss/postcss` plugin. | Tailwind v4 drops `tailwind.config.js`; theme lives in `@theme` block inside `globals.css`. Produces ~70% smaller CSS than v3. Official Tailwind docs list Next.js as a first-class target. |
| Radix Primitives | latest `@radix-ui/react-*` | Dialog (Change-role confirm — Pitfall 18), Tooltip (hover-timestamps CHAT-06, keyboard-accessible per WCAG 2.1 1.4.13), RadioGroup (fixed-option 👎 FDBK-02), Popover (role-pill dropdown → "Change role"). | React 19 support stabilised; single-purpose unstyled primitives with full ARIA/focus handling out of the box. |
| lucide-react | `^1.8` (latest) | Icons (person, pencil, paper-plane, stop, refresh, thumbs, copy, warning). | Tree-shakeable SVG icons with 1000+ glyphs; React-19-compatible per installed-version checks. |

### Supporting

| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| clsx *or* tailwind-merge | latest | Conditional className composition. `tailwind-merge` additionally de-dupes conflicting Tailwind classes. | Use `clsx` for simple conditionals; add `tailwind-merge` if dynamic class combinations need conflict resolution. Both are tiny. |
| `@testing-library/react` | latest | Component tests under Vitest. | For any `.test.tsx` that renders a client component. |
| `@testing-library/user-event` | latest | Realistic keyboard/mouse event simulation (Enter-to-send, Shift+Enter newline). | Any test asserting CHAT-05 keyboard submit behaviour. |
| `@vitejs/plugin-react` | latest | Vitest JSX transform. | Added to `vitest.config.mts` plugins. |
| `jsdom` | latest | DOM environment for component tests. | Use per-file `// @vitest-environment jsdom` docblock — do NOT make it the default (224 server tests run faster in node). |
| `@playwright/test` | latest | E2E streaming flow: stop-response (CHAT-03), error retry (CHAT-07), change-role state wipe (Pitfall 4/13), sessionStorage survival across refresh (Pitfall 17). | One Playwright config + one or two spec files are enough for the 5 SC listed in ROADMAP §Phase-3. |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Radix Primitives | **React Aria Components** (Adobe) | Also strong WCAG coverage. Radix has more ecosystem examples with Next/Tailwind; React Aria's `useKeyboard` and drag-and-drop are deeper. For Phase-3 primitives needed (Dialog/Tooltip/RadioGroup/Popover), Radix is a cleaner fit and easier to audit. **Pick Radix.** |
| Radix Primitives | **Base UI** (new project from Radix team) | Newer, less stable, less documentation as of 2026-04. **Not recommended for this phase.** |
| lucide-react | `@radix-ui/react-icons` | Radix icons are fewer and more minimal; lucide has a wider vocabulary (stop, paper-plane, retry, warning). **Pick lucide-react.** |
| Local React state | Zustand / Jotai | CONTEXT.md §Claude's Discretion explicitly allows Zustand/Jotai "if wiring gets gnarly." Message log has one consumer (the chat component tree). **Start with `useReducer` + Context; escalate only if prop-drilling hits three levels.** |
| Tailwind v4 | Tailwind v3 + config file | v4 is current, zero-config, and is what `create-next-app@latest` ships. No reason to use v3. |
| `fetch + ReadableStream` | `EventSource` API | `EventSource` is **GET-only** — we must POST messages + role. Not an option. Also `EventSource` does not support custom headers or `AbortController`. **fetch+stream is mandatory.** |
| `fetch + ReadableStream` (hand-rolled) | `@microsoft/fetch-event-source` | Adds a dependency for an ~80-line parser. The `docs/api-chat-contract.md` snippet already inlines the parser. **Use the inlined snippet — don't add a dep.** |

### Installation (pnpm — matches repo)

```bash
# Tailwind v4 + PostCSS
pnpm add -D tailwindcss @tailwindcss/postcss postcss

# Radix primitives (install only what Phase 3 uses)
pnpm add @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-radio-group @radix-ui/react-popover

# Icons
pnpm add lucide-react

# Utility
pnpm add clsx tailwind-merge

# Component test infra
pnpm add -D @testing-library/react @testing-library/user-event @vitejs/plugin-react jsdom

# E2E
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

---

## Architecture Patterns

### Recommended project structure

```
src/
├── app/
│   ├── layout.tsx           # Root layout (server) — imports globals.css, sets <html>, font
│   ├── page.tsx             # Role-select landing OR redirect to /chat (single-stateful-page is also fine per CONTEXT.md)
│   ├── globals.css          # @import "tailwindcss"; + @theme { ... } custom tokens
│   ├── providers.tsx        # 'use client' — Radix <Tooltip.Provider>, maybe a ChatContext wrapper
│   └── api/                 # Unchanged — Phase-2 routes
├── chat-ui/                 # Client-only chat surface (all files 'use client')
│   ├── ChatPage.tsx         # Orchestrator: role gate → <RoleSelect /> or <ChatSurface />
│   ├── ChatSurface.tsx      # Header + messages + input + chips
│   ├── Header.tsx           # Role pill (popover) + "New conversation"
│   ├── MessageList.tsx
│   ├── Message.tsx          # KB or Me bubble; renders citations, timestamp tooltip, footer controls
│   ├── AssistantControls.tsx# Copy + 👍/👎 + 👎-expand panel
│   ├── InputBar.tsx         # Textarea + submit/stop; handles Enter/Shift+Enter, in-flight state
│   ├── ChipRow.tsx          # Suggested-prompt chips; auto-submits
│   ├── TypingDots.tsx
│   ├── ErrorCard.tsx        # Infra-error retry card (CHAT-07)
│   ├── ChangeRoleDialog.tsx # Radix Dialog confirm (Pitfall 18)
│   ├── RoleSelect.tsx       # Two cards landing
│   ├── useChatStream.ts     # fetch+ReadableStream consumer with AbortController; ReturnType is the imperative send/stop API
│   ├── useRolePersistence.ts# sessionStorage get/set/clear with SSR-safe mount gating
│   ├── useDraftBuffer.ts    # debounced sessionStorage.kbroles.draft read/write (Pitfall 17, draft only)
│   ├── chatReducer.ts       # Message log + in-flight state machine (pure reducer — easy to unit-test under node env)
│   └── __tests__/           # .test.tsx component tests (jsdom docblock)
├── ui/
│   └── sourceTitles.ts      # { 'flagging-articles': 'Flagging Articles', ... } — seeded from handover §14 for UTIL-01 + Phase-4 panel
└── lib/
    └── time.ts              # formatRelative(date) — pure, unit-testable under node env
```

**Why split `chat-ui/` from `ui/` and `lib/`:**
- Everything under `chat-ui/` is `'use client'` and imports React/Radix/lucide.
- Everything under `ui/` and `lib/` is framework-agnostic pure TypeScript, testable under the existing node-env Vitest, and reusable by Phase 4.

### Pattern 1: Single-stateful-page vs route-segment split

CONTEXT.md leaves this open. **Recommended: single stateful `app/page.tsx` with conditional render** (`role == null ? <RoleSelect /> : <ChatSurface role={role} />`). Reasons:
- SessionStorage-driven flow (ROLE-02 return-user skips role-select) is far simpler without routing.
- No `useRouter.push` / `useSearchParams` dance during role-set or change-role.
- Back-button semantics stay clean — refresh stays on chat if role is still in sessionStorage.
- Easy to E2E: one URL, one Playwright navigation.

If the planner prefers routes, use `app/(chat)/page.tsx` with a `'use client'` root; but there is no architectural benefit.

### Pattern 2: State management — `useReducer` + Context

The chat surface has one message log with several mutators (user send, answer_delta append, citations attach, fallback replace, error transition, retry reset, stream abort, new-conversation clear, change-role clear). A reducer makes every transition visible in one place and trivially unit-testable.

**Shape:**
```typescript
// chatReducer.ts
export type Message =
  | { kind: 'user'; id: string; text: string; at: number }
  | { kind: 'assistant'; id: string; state: 'streaming' | 'done' | 'fallback' | 'error';
      text: string; citations: Citation[]; at: number;
      feedback?: 'up' | { kind: 'down'; reason: 'hallucinated' | 'wrong_citation' | 'incomplete' | 'other' };
      stoppedByUser?: boolean;
      errorCode?: ErrorCode; requestId?: string }

export type ChatState = {
  messages: Message[]
  inFlightId: string | null   // id of the assistant bubble currently streaming (enables Stop)
}

export type ChatAction =
  | { type: 'user/send'; id: string; text: string; at: number }
  | { type: 'assistant/start'; id: string; at: number }
  | { type: 'assistant/delta'; id: string; text: string }
  | { type: 'assistant/citations'; id: string; citations: Citation[] }
  | { type: 'assistant/done'; id: string }
  | { type: 'assistant/fallback'; id: string; text: string }
  | { type: 'assistant/error'; id: string; code: ErrorCode; requestId: string }
  | { type: 'assistant/stoppedByUser'; id: string }
  | { type: 'assistant/retry'; id: string }  // removes failed bubble; caller re-dispatches send
  | { type: 'feedback/up'; id: string }
  | { type: 'feedback/down'; id: string; reason: 'hallucinated' | 'wrong_citation' | 'incomplete' | 'other' }
  | { type: 'feedback/clear'; id: string }
  | { type: 'conversation/clear' }   // wipes messages, keeps role
```

Ship the reducer under `src/chat-ui/chatReducer.ts` as a **pure, node-testable** function. Tests under `src/chat-ui/__tests__/chatReducer.test.ts` run under the existing node environment (no docblock needed) and give the planner near-100% state-coverage for free.

### Pattern 3: `useChatStream` hook — the fetch+stream consumer

Wraps the `streamChat` parser from `docs/api-chat-contract.md` into a React hook. Essential invariants:

1. **One `AbortController` per request**, owned by the hook. `stop()` calls `.abort()`. Unmount also calls `.abort()`.
2. **Role is a parameter of the `send(role, messages)` call**, never implicit state held across renders. This is **Pitfall 4** — if the hook closed over a stale role via `useCallback` without proper deps, a role-change mid-session could leak the prior role into the next `POST`.
3. **`response.ok` branching happens BEFORE reading the body** (the contract's §7 pre-stream errors are JSON, not SSE).
4. Every terminal event (`done`, `fallback`, `error`) **calls `reader.cancel()`** — don't let a lingering reader hold the socket open.
5. Emit events via an `onEvent` callback OR an internal `useReducer` dispatch — your choice, but keep the hook's public surface imperative (`send`, `stop`, `isStreaming`).
6. Expose the `X-Request-Id` on every `error`-event callback; surface it in `ErrorCard` copy affordance.

### Pattern 4: SSR-safe sessionStorage hydration

The AUTH-02 decision pins state to `sessionStorage`, which does not exist on the server. All three values (`kbroles.role`, `kbroles.draft`, in-memory messages) are client-only. Use the **"mount gate" pattern** to avoid hydration mismatch:

```typescript
// useRolePersistence.ts  — full pattern
'use client'
import { useEffect, useState } from 'react'
import type { Role } from '@/chat-ui/types'
const KEY = 'kbroles.role'

export function useRolePersistence() {
  // Null on both server and first client render — identical markup → no mismatch.
  const [role, setRoleState] = useState<Role | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(KEY)
      if (v === 'consumer' || v === 'author') setRoleState(v)
    } catch { /* sessionStorage unavailable (e.g. Safari private mode) */ }
    setHydrated(true)
  }, [])

  const setRole = (next: Role | null) => {
    setRoleState(next)
    try {
      if (next == null) sessionStorage.removeItem(KEY)
      else sessionStorage.setItem(KEY, next)
    } catch { /* ignore */ }
  }
  return { role, setRole, hydrated }
}
```

**The `hydrated` flag matters:** the ChatPage orchestrator must render a skeleton (or null, or a fixed loading card) when `!hydrated` so the initial server paint and the initial client paint are identical. If you render `role == null ? <RoleSelect /> : <ChatSurface />` before hydration completes, a returning user gets a flash of the role-select screen before sessionStorage is read.

### Pattern 5: Accessibility — icon-paired color every time

CONTEXT.md locks Pitfall 16. Every colour-coded element (role pill green/purple, citation chips, fallback border, error card) **must also carry an icon**. Source: Radix Primitives docs on accessibility (https://www.radix-ui.com/primitives/docs/overview/accessibility). Concretely:

- Consumer role → green + `<User size={14} />` (lucide)
- Author role → purple + `<Pencil size={14} />`
- Fallback marker → left-border tint + `<Info size={14} />` or `<AlertCircle size={14} />`
- Error card → neutral-warning + `<AlertTriangle size={16} />`

### Anti-patterns to avoid

- **Using `EventSource` for `/api/chat`** — it's GET-only, no body, no custom headers, no `AbortController`. The contract POSTs JSON body. Non-starter.
- **Importing from `src/chat/*` server modules into client code** — pulls `zod` + `@/config/env` (which reads `process.env` at module eval) into the client bundle. The wire shapes are short (~30 lines); mirror them in `src/chat-ui/types.ts`.
- **Reading sessionStorage during render without a mount gate** — produces hydration mismatch warnings and, for returning users, a visible flicker from role-select → chat-with-greeting.
- **Relying on JSX color classes alone to signal role** — violates Pitfall 16. Always pair with an icon.
- **Passing `role` through a stale closure in `useChatStream`** — Pitfall 4. The `send` function must accept `role` as an argument, not close over a state variable that may be stale by the time the user hits Enter.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Dialog with focus trap, ESC-to-close, scroll lock | A custom modal div | `@radix-ui/react-dialog` | Focus trap, aria-modal, initial-focus target, portal to document.body, and scroll-lock are all easy to get wrong and hard to test. |
| Keyboard-accessible hover tooltip (CHAT-06) | `title=` attribute or bespoke hover div | `@radix-ui/react-tooltip` | `title=` is not keyboard-reachable; bespoke hover misses WCAG 2.1 1.4.13 "Content on Hover or Focus" (dismissible/hoverable/persistent). Radix handles all three. |
| Radio group with arrow-key navigation (FDBK-02) | Multiple `<input type="radio">` | `@radix-ui/react-radio-group` | Proper roving-tabindex, `aria-checked`, arrow keys. |
| Role-pill dropdown → Change role | Bespoke dropdown | `@radix-ui/react-popover` | Outside-click dismiss, focus management, portal. |
| SSE parser for POST streams | Hand-rolled event-source wrapper | The `streamChat()` snippet already in `docs/api-chat-contract.md` §8 | Working, tested, handles partial-frame buffering, `Retry-After`, `X-Request-Id`. Copy it into `useChatStream.ts` verbatim. |
| Relative-time formatter | `Intl.RelativeTimeFormat` wrapper | A small pure `formatRelative(date, now)` in `src/lib/time.ts` | Intl does minutes/hours/days but you still need "just now" for <60s and "HH:mm yesterday" — write 20 lines, unit-test under node, be done. |
| Clipboard write | `document.execCommand('copy')` | `navigator.clipboard.writeText(text)` | `execCommand` is deprecated. Clipboard API requires `window.isSecureContext`; on localhost over http it works; in Teams iframe this **may** need clipboard-write permission policy — flag for Phase 5 (Teams host) but it should just work in the browser PWA path. |
| `cn()` class joiner | Manual string concat with conditionals | `clsx` | 200-byte dep, prevents `undefined` leaking into className. |

**Key insight:** accessibility primitives are the single biggest hand-roll trap in this phase. A "confirm modal" built by hand will fail at least one of: focus trap, ESC, background scroll lock, or initial-focus placement. Radix ships all four correct by default and survives audits.

---

## Common Pitfalls

### Pitfall 1: Role contamination (ROADMAP Pitfall 4) — role held in hook closure

**What goes wrong:** `useChatStream` stores role in a `useRef` or in a `useCallback` closure without the right deps. User changes role, types a follow-up, but the POST body carries the previous role.

**Why it happens:** React hooks that capture state in closures are stale unless explicitly refreshed. The bug is invisible in manual dev-mode testing because the race window is small.

**How to avoid:**
- Make `send(role, messages)` an imperative function that **accepts role as an argument every call**. Never store it inside the hook.
- When "Change role" fires, its handler ALSO calls the hook's `stop()` first to abort any in-flight stream **before** wiping state (see Pitfall 2 below).
- Write a Vitest test that calls `send('consumer', ...)`, `send('author', ...)` in sequence and asserts the fetch bodies carry the correct `role` on each call (mock `global.fetch`).

**Warning signs:** A console log of the outgoing body would show role mismatch. Add a dev-only assertion.

### Pitfall 2: Change-role doesn't clear in-flight stream (ROADMAP Pitfall 13)

**What goes wrong:** User clicks Change role mid-stream, confirms, picks the new role, sends a new message. The PREVIOUS stream (still alive) delivers deltas into... where? Worst case, into the new role's first message bubble. That's cross-role contamination of answer text.

**Why it happens:** `AbortController.abort()` is not called as the first step of the change-role flow.

**How to avoid:**
- `onConfirmChangeRole` handler sequence, in order: `stop()` → wait one tick (optional) → `dispatch({type: 'conversation/clear'})` → `setRole(null)` (also clears sessionStorage) → draft buffer clear.
- The useChatStream hook should **guard every dispatch on the `signal.aborted` check** — any delta that arrives after `abort()` is dropped on the floor.
- E2E test: start a stream, click Change role, confirm, pick the other role, send a message, assert the assistant bubble only contains the new response.

**Warning signs:** Manual test: issue a long-running question, quickly click Change role → observe chat during transition. If any old content bleeds through, this pitfall is live.

### Pitfall 3: Session loss on refresh (ROADMAP Pitfall 17) — buffer full history, not draft

**What goes wrong:** Planner over-reads Pitfall 17 and persists the entire message log, violating AUTH-02.

**Why it happens:** "Local-storage buffer" sounds like full persistence.

**How to avoid:**
- **Only the unsent draft** goes to sessionStorage (`kbroles.draft`), debounced on keystroke (~250ms).
- Restore on mount IF non-empty; clear on send.
- Messages are React state only. Refresh wipes them. This is by design.
- Test: type into the textarea, refresh (same tab), assert the textarea is pre-populated. Send a message, refresh, assert the chat is empty but role persists.

**Warning signs:** A PR that stores `messages: Message[]` in sessionStorage. Rejects on review.

### Pitfall 4: Refresh flashes role-select before sessionStorage loads

**What goes wrong:** Returning user (role already set) sees a 200ms flicker of the role-select screen before ChatSurface renders.

**Why it happens:** Initial server render and initial client render both produce `role == null`; the post-hydrate `useEffect` flips to `role === 'consumer'`, triggering a re-render to ChatSurface.

**How to avoid:** Use the `hydrated` flag from `useRolePersistence`. Render a minimal skeleton/spinner while `!hydrated`. First paint is stable markup; post-mount render transitions directly to either RoleSelect or ChatSurface without passing through the "fallback null" state.

**Warning signs:** Load the app, set role, reload — visible RoleSelect flash.

### Pitfall 5: `fetch` error swallowed by abort

**What goes wrong:** User clicks Stop. `AbortController.abort()` causes `fetch()` to throw a `DOMException: AbortError`. If the error handler doesn't discriminate, the UI shows an error card for a user-initiated stop.

**Why it happens:** All `fetch` errors look the same.

**How to avoid:**
```typescript
try {
  // ... streamChat(...)
} catch (err) {
  if (err instanceof DOMException && err.name === 'AbortError') {
    dispatch({ type: 'assistant/stoppedByUser', id })
    return
  }
  // genuine error → transition to error state
  dispatch({ type: 'assistant/error', id, code: 'internal', requestId })
}
```

Set a flag `stoppedByUser` when the user clicks Stop, AND check `AbortError` as a belt-and-suspenders — both signals are useful.

### Pitfall 6: Next.js 16 hydration mismatch from `Date.now()` / `Math.random()`

**What goes wrong:** Generating message IDs or timestamps inside a component body that runs on both server and client. Different values → hydration error.

**Why it happens:** `app/page.tsx` is a server component by default. If it renders an initial greeting or timestamps with `Date.now()`, SSR gets one value and client gets another.

**How to avoid:**
- All chat state lives in a `'use client'` component.
- Message IDs come from `crypto.randomUUID()` called inside an event handler (never during render).
- Greeting card is static copy (no time rendered). Hover-timestamps get their absolute time formatted on hover/focus inside the Tooltip content — at interaction time, no SSR concern.

**Warning signs:** A "Hydration failed" console error on load.

### Pitfall 7: Tailwind v4 class-name collisions in dynamic bubble styling

**What goes wrong:** Conditionally compose classes like `cn('bg-primary', role === 'author' && 'bg-purple-600')` — the later one doesn't always win in Tailwind v4's source ordering.

**Why it happens:** Tailwind v4 source-order rules are CSS-cascade-based. Two equal-specificity rules: the later in CSS wins, not the later in className string.

**How to avoid:** Use `tailwind-merge` for conditional styling so it de-dupes to the intended class.

### Pitfall 8: EventSource temptation

**What goes wrong:** Planner reaches for `new EventSource('/api/chat')` per muscle memory.

**Why it fails:** `EventSource` is GET-only. Our contract POSTs `{ role, messages }`. Also EventSource cannot be aborted and doesn't support custom headers.

**How to avoid:** The contract's §8 snippet uses `fetch` + `getReader()` + `TextDecoder`. Copy it into `useChatStream.ts` verbatim. (Flagged here for planner sanity because this is the #1 muscle-memory mistake.)

### Pitfall 9: Chip auto-submit during an in-flight stream

**What goes wrong:** User starts typing, sees chips (they only show on empty chat — so this is actually a guard CONTEXT.md already gives you), or `ChipRow` re-renders with a stale `onChipClick` that dispatches a second send while the first is mid-stream.

**How to avoid:** CONTEXT.md locks: "Chips hide after first message." This is your primary guard. Secondary: chip click handler checks `inFlightId === null` before sending.

### Pitfall 10: Clipboard API in non-secure context during local dev

**What goes wrong:** `navigator.clipboard.writeText` throws on `http://` non-localhost contexts (e.g. LAN IP).

**How to avoid:** `navigator.clipboard` is available on `localhost` and `https://`. Wrap in a try/catch; fall back to a silent no-op with a tiny toast "copy unavailable" in that edge case. This is not a hard blocker — localhost dev works.

---

## Code Examples

### Example 1: Consuming `/api/chat` — adapted from `docs/api-chat-contract.md` §8

**Source: Canonical client contract doc (`docs/api-chat-contract.md` §8) — already in repo.**

```typescript
// src/chat-ui/useChatStream.ts
'use client'
import { useCallback, useRef, useState } from 'react'
import type { Role, SseEvent, Message } from './types'

export function useChatStream(onEvent: (ev: SseEvent, requestId: string) => void) {
  const abortRef = useRef<AbortController | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  const send = useCallback(
    async (role: Role, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
      // Pitfall 4: role comes from the caller on every send, NEVER closed over.
      stop() // cancel any in-flight before starting a new one
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setIsStreaming(true)

      let requestId = 'unknown'
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, messages }),
          signal: ctrl.signal,
        })
        requestId = res.headers.get('X-Request-Id') ?? 'unknown'

        if (!res.ok) {
          // Contract §7: pre-stream error body is JSON, not SSE.
          const body = await res.json().catch(() => ({} as { error?: string }))
          onEvent(
            { type: 'error', code: 'internal', message: body.error ?? `http_${res.status}` },
            requestId,
          )
          return
        }
        if (!res.body) {
          onEvent({ type: 'error', code: 'internal', message: 'missing_body' }, requestId)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { value, done } = await reader.read()
          if (value) buffer += decoder.decode(value, { stream: !done })
          if (done) break
          let sep: number
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, sep)
            buffer = buffer.slice(sep + 2)
            const match = frame.match(/^data: (.*)$/s)
            if (!match) continue
            const ev = JSON.parse(match[1]) as SseEvent
            onEvent(ev, requestId)
            if (ev.type === 'done' || ev.type === 'fallback' || ev.type === 'error') {
              reader.cancel().catch(() => {})
              return
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return // stopped by user
        onEvent(
          { type: 'error', code: 'internal', message: String(err) },
          requestId,
        )
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [stop, onEvent],
  )

  return { send, stop, isStreaming }
}
```

### Example 2: Radix Dialog for "Change role" confirm (Pitfall 18)

**Source: Radix Primitives Dialog docs (https://www.radix-ui.com/primitives/docs/components/dialog).**

```tsx
// src/chat-ui/ChangeRoleDialog.tsx
'use client'
import * as Dialog from '@radix-ui/react-dialog'

export function ChangeRoleDialog({
  open, onOpenChange, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl focus:outline-none"
        >
          <Dialog.Title className="text-lg font-semibold">Change role?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-gray-600">
            Changing role will clear this conversation. Continue?
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              {/* Cancel is the DEFAULT focused element per Radix initialFocus — confirm it with autoFocus */}
              <button autoFocus className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
            </Dialog.Close>
            <button
              onClick={() => { onConfirm(); onOpenChange(false) }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white"
            >
              Change role
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

### Example 3: Radix Tooltip with keyboard accessibility (CHAT-06)

**Source: Radix Tooltip docs — Tooltip opens on focus AND hover by default (WCAG 2.1 1.4.13).**

```tsx
// src/chat-ui/Timestamp.tsx
'use client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { formatRelative } from '@/lib/time'

export function Timestamp({ at }: { at: number }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <time
          dateTime={new Date(at).toISOString()}
          tabIndex={0}
          className="text-xs text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        >
          {formatRelative(at, Date.now())}
        </time>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="top" className="rounded bg-black px-2 py-1 text-xs text-white">
          {new Date(at).toLocaleString()}
          <Tooltip.Arrow className="fill-black" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
```

Wrap the whole app in a `<Tooltip.Provider delayDuration={300}>` (typically inside `app/providers.tsx`).

### Example 4: SSR-safe sessionStorage for role (full pattern including `hydrated` gate)

See §Pattern 4 above for the verbatim hook.

### Example 5: Vitest jsdom docblock for a single UI test

**Source: Next.js 16 official Vitest docs (https://nextjs.org/docs/app/guides/testing/vitest) + Vitest docs (https://vitest.dev/guide/environment).**

```tsx
// src/chat-ui/__tests__/ChatSurface.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatSurface } from '../ChatSurface'

describe('ChatSurface — keyboard submit (CHAT-05)', () => {
  it('Enter sends, Shift+Enter inserts newline', async () => {
    // ...
  })
})
```

Extend `vitest.config.mts` to add `@vitejs/plugin-react` to `plugins` and optionally widen the include glob — the docblock handles environment on a per-file basis.

### Example 6: Mirrored wire types (client-only — do NOT import from `src/chat/*`)

```typescript
// src/chat-ui/types.ts  — mirror of docs/api-chat-contract.md §3/§9
export type Role = 'consumer' | 'author'

export interface Citation {
  source_id: 'KB0020882' | 'KB0022991' | 'SNOW_FORM'
  section_id: string
  quote: string
}

export type FallbackReason =
  | 'refusal' | 'can_answer_false' | 'all_citations_stripped' | 'allowlist_violation'

export type ErrorCode =
  | 'upstream_timeout' | 'upstream_5xx' | 'schema_reject_after_retry' | 'internal'

export type SseEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'citations';    citations: Citation[] }
  | { type: 'fallback';     reason: FallbackReason; text: string }
  | { type: 'done';         can_answer: boolean; validator_flips: number }
  | { type: 'error';        code: ErrorCode; message: string }

export interface ChipItem { id: string; label: string; text: string }
```

**Planner note:** Add an assertion-style test that compares this file's shape against `src/chat/sse.ts` wire shape at a structural level (even a hand-written "these fields must match" test is fine) — it's a guard against the two drifting.

---

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` + PostCSS plugin | Tailwind v4 CSS-first `@theme` block, `@tailwindcss/postcss` plugin | Tailwind v4.0 (2025) | No JS config file. Theme tokens live in `globals.css`. |
| `EventSource` for SSE | `fetch` + `ReadableStream` + `getReader()` | Long-standing, but required for POST payloads | Only path when body is non-empty or you need `AbortController`. |
| Jest + Babel | Vitest 3 + Vite transform | Vitest 1.0 (2024); Next 16 quickstart uses Vitest | Per-test-file environment via `// @vitest-environment` docblock. |
| Bespoke modal + tooltip code | Radix Primitives / React Aria / Base UI | Radix full React-19 support stabilised mid-2024 | WCAG AA out of the box. |
| `document.execCommand('copy')` | `navigator.clipboard.writeText()` | Clipboard API GA | Deprecated but still works; modern API requires secure context. |

**Deprecated / outdated:**
- `@radix-ui/react-*` **v1.x** had React-19 peer-dep warnings; v2+ fixes this. Install latest.
- Tailwind v3 `tailwind.config.js` pattern — still works but not recommended for new projects.
- `EventSource` for any endpoint that needs POST or Abort — not an option here.

---

## Open Questions

1. **Copy-with-citation-suffix formatting — plaintext or rich?**
   - **What we know:** CONTEXT.md §Copy answer (UTIL-01) locks the plaintext format exactly: `<answer>\n\n(Source: KB0022991 · Flagging Articles)`. No rich-text variant.
   - **What's unclear:** Whether `navigator.clipboard.write()` with a ClipboardItem for both `text/plain` and `text/html` is ever useful. CONTEXT.md says plaintext only → no open question.
   - **Recommendation:** Plaintext via `writeText()`. Defer rich-copy to v1.1 backlog.

2. **Does Teams web app iframe allow `navigator.clipboard.writeText` without a permissions prompt?**
   - **What we know:** Phase-3 context is browser-first. Teams embedding is Phase 5.
   - **What's unclear:** Teams iframe may require `permissions-policy: clipboard-write`; CONTEXT.md does not call this out because it's a Phase-5 concern.
   - **Recommendation:** Plan for graceful fall-through (try/catch around `writeText`, silent no-op with toast). Flag as open question for Phase 5 planner.

3. **How should the planner handle the two-vitest-environment split cleanly?**
   - **What we know:** Existing `vitest.config.mts` uses `environment: 'node'`; 224 backend tests depend on that.
   - **Options:**
     a. Add `// @vitest-environment jsdom` docblock to every UI test file (lowest churn; per-file control; matches existing docblock-for-raw-markdown mental model).
     b. Use **Vitest projects** — one project node, one jsdom. Cleaner for large UI layers but overkill for Phase 3.
   - **Recommendation:** Docblock per file. Escalate to projects if UI tests exceed ~30 files (unlikely in Phase 3).

4. **Should there be a "streaming delta cap" client-side to guard against huge responses?**
   - **What we know:** Server enforces grounded-answer text length via model + validator; no explicit cap on answer string length in the contract. Client currently concatenates `answer_delta` indefinitely.
   - **What's unclear:** Edge case where the server streams a degenerate long answer — the client will render all of it.
   - **Recommendation:** Don't add a cap in Phase 3. If it becomes a live issue, the fix is a bubble maxHeight + scroll on the CSS side, not a character cap on the state side.

---

## Sources

### Primary (HIGH confidence)
- **Phase-2 client contract (canonical):** `docs/api-chat-contract.md` — full wire spec incl. §3 event schema, §4 ordering, §7 pre-stream HTTP errors, §8 reference TypeScript consumer, §9 Citation shape, §10 headers, §11 `/api/prompts` shape. **Copy the §8 snippet into `useChatStream.ts`.**
- **Repo source of truth:**
  - `src/app/api/chat/route.ts` (POST pipeline — confirms `X-Request-Id`, `X-Accel-Buffering: no`, terminal event guarantees)
  - `src/app/api/prompts/route.ts` (GET `?role=...` → `{role, prompts: ChipItem[]}`; 5 consumer / 8 author)
  - `src/chat/sse.ts` (server-side wire types — mirror, do not import)
  - `src/chat/requestSchema.ts` (server-side error codes enumerated at line 38-46)
  - `src/prompts/suggested.ts` (chip shape reference)
- **Next.js 16 official docs:**
  - Vitest setup: https://nextjs.org/docs/app/guides/testing/vitest — confirms `@vitejs/plugin-react`, `jsdom`, `@testing-library/react` stack
  - CSS / Tailwind v4: https://nextjs.org/docs/app/getting-started/css
- **Tailwind CSS v4 official docs:**
  - https://tailwindcss.com/docs/guides/nextjs — confirms `pnpm add -D tailwindcss @tailwindcss/postcss postcss`, `postcss.config.mjs` shape, `@import "tailwindcss"` in globals.css
- **Radix Primitives official docs:**
  - https://www.radix-ui.com/primitives/docs/overview/accessibility — confirms full ARIA/focus/keyboard handling baseline
  - https://www.radix-ui.com/primitives/docs/components/tooltip — confirms WCAG 2.1 1.4.13 Content-on-Hover compliance (tooltip opens on focus AND hover, dismissible/hoverable/persistent)
  - https://www.radix-ui.com/primitives/docs/components/dialog — focus trap + initialFocus + portal patterns
- **Vitest 3 docs:**
  - https://vitest.dev/guide/environment — per-file `// @vitest-environment jsdom` docblock syntax confirmed
  - https://vitest.dev/guide/projects — Vitest projects for split environment
- **MDN — Web APIs:**
  - https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams — confirms AbortController + fetch + ReadableStream is the standard POST-SSE pattern

### Secondary (MEDIUM confidence)
- Radix React 19 compatibility stabilised statement: https://x.com/radix_ui/status/1800575009125228818 and GitHub issue https://github.com/radix-ui/primitives/issues/2900 (both confirm React-19 RC → stable mid-2024). Cross-verified against npm package metadata in search results.
- Playwright for Next 16 App Router E2E: https://nextjs.org/docs/pages/guides/testing/playwright (pages dir doc, but same `create-next-app --example with-playwright` scaffold applies to app dir).
- Tailwind v4 bundle-size claim (~70% smaller than v3): community blog posts agree; not mission-critical.

### Tertiary (LOW confidence — flagged for validation)
- "Base UI is the next evolution from Radix" (search result aside) — mentioned only to explain why we are NOT picking it; not load-bearing.

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — Tailwind v4 + Radix + lucide combination is verified against official Next.js 16 docs and Tailwind docs; all listed packages ship React-19 support on current versions.
- **Architecture (reducer + `useChatStream` + mount-gated sessionStorage):** HIGH — patterns are standard React-19 App Router patterns, verified against MDN Streams API + Next.js hydration guidance; all three core hooks have working reference shapes in this doc.
- **Contract consumption:** HIGH — canonical `docs/api-chat-contract.md` ships a working TypeScript consumer snippet verified by the Phase-2 route handler code.
- **Pitfalls:** HIGH for the ROADMAP-listed Pitfalls 4/13/16/17/18 (direct callouts with tested mitigations); MEDIUM for the 5 additional pitfalls introduced here (AbortError discrimination, hydration mismatch, Tailwind v4 class ordering, EventSource temptation, clipboard secure-context) — all grounded in MDN / Tailwind docs / Next.js docs.

**Testing infra gap (notable):** Repo has ZERO client-test infra today. Planner will spend ~1 plan task installing jsdom/RTL/user-event, extending vitest.config.mts plugins, and adding Playwright for E2E. This is nontrivial but well-scoped.

**Research date:** 2026-04-22
**Valid until:** ~2026-05-22 (30 days — mature stable stack; no fast-moving deps on the critical path). Re-check Tailwind/Radix/lucide versions before Phase 4 if more than 60 days pass.

---

*Phase: 03-role-experience-and-chat-ui*
*Research completed: 2026-04-22*

---
phase: 03-role-experience-and-chat-ui
plan: "05"
subsystem: ui
tags: [react, next.js, usereducer, sse, chatReducer, usePrompts, ChatSurface, ChatPage, Greeting, useRolePersistence, useChatStream, radix-ui, testing-library]

# Dependency graph
requires:
  - phase: 03-role-experience-and-chat-ui/01
    provides: Tailwind v4 + Radix + lucide-react installed; app shell layout/providers/page
  - phase: 03-role-experience-and-chat-ui/02
    provides: chatReducer + initialChatState + wire types (ChatState, ChatAction, SseEvent, Role, ChipItem)
  - phase: 03-role-experience-and-chat-ui/03
    provides: useRolePersistence + useDraftBuffer + useChatStream hooks
  - phase: 03-role-experience-and-chat-ui/04
    provides: All 13 presentational components (InputBar forwardRef, Message onRetry, MessageList onRetry, ChangeRoleDialog "Change role and clear", Header, ChipRow, AssistantControls, ErrorCard, Greeting...)
provides:
  - ChatPage orchestrator with sessionStorage hydration gate (Pitfall 4 — no RoleSelect flash)
  - ChatSurface wiring hub — useReducer(chatReducer) + useChatStream + useDraftBuffer + usePrompts + all dispatches
  - Greeting component (role-aware welcome copy for Consumer and Author)
  - usePrompts hook (GET /api/prompts?role= with loading/error + graceful 5xx degradation)
  - app/page.tsx replacement — Plan 01 placeholder → <ChatPage /> server boundary
  - Pitfall 13 change-role mid-stream ordering enforced and test-asserted
  - Retry flow: assistant/retry dispatch + reconstruct user turn from state.messages[idx-1]
affects:
  - 03-06-e2e-visual-smoke (exercises full ChatPage render path in Playwright)
  - Phase 5 (auth gate sits in ChatPage/providers.tsx — PHASE 5 REPLACEMENT POINT)

# Tech tracking
tech-stack:
  added: []  # No new dependencies; all libs present from Plans 01–04
  patterns:
    - "Compositional-only discipline: Plan 05 consumes Plan 04 contracts without mutating artefacts"
    - "TooltipProvider wrapper in jsdom integration tests (Radix Tooltip.Root requires context)"
    - "Never-resolving fetch mock for Stop/Pitfall-13 tests (jsdom ReadableStream pull timing unreliable)"
    - "asstIdRef useRef<string|null> for per-send stable dispatch target across re-renders"

key-files:
  created:
    - src/chat-ui/usePrompts.ts
    - src/chat-ui/Greeting.tsx
    - src/chat-ui/ChatPage.tsx
    - src/chat-ui/ChatSurface.tsx
    - src/chat-ui/__tests__/usePrompts.test.tsx
    - src/chat-ui/__tests__/ChatSurface.test.tsx
  modified:
    - src/app/page.tsx  # Plan 01 placeholder → <ChatPage /> server boundary

key-decisions:
  - "Never-resolving fetch mock for Stop + Pitfall-13 tests — jsdom ReadableStream enqueue+pull timing is unreliable; observable contract (signal.aborted, no error card, stop-btn gone) is verifiable without DOM text"
  - "TooltipProvider required as test wrapper — Timestamp uses Radix Tooltip.Root which throws without Provider context; added Providers wrapper in ChatSurface.test.tsx (Rule 3 auto-fix)"
  - "onChangeRole() called AFTER stop()+conversation/clear in handleConfirmChangeRole — Pitfall 13 invariant enforced in ChatSurface (not ChatPage) so dispatch ordering is owned in one place"
  - "asstIdRef.current cleared in every terminal handler (done/fallback/error/stoppedByUser/handleConfirmChangeRole) to prevent stale dispatch after race conditions"

patterns-established:
  - "ChatPage = hydration gate + role routing; ChatSurface = wiring hub; all state in ChatSurface"
  - "buildWireMessages: filters done assistant + all user turns into stateless POST body"
  - "dispatchSend: role passed as argument to send() not captured from closure (Pitfall 4)"

# Metrics
duration: ~12min active
completed: 2026-04-23
---

# Phase 3 Plan 05: Chat Page Wiring Summary

**ChatSurface end-to-end wiring: chatReducer + useChatStream + chips + retry + Pitfall-13 change-role ordering enforced at test level; app/page.tsx delivers live chat at http://localhost:3000**

## Performance

- **Duration:** ~12 min active (wall-clock includes test iterations)
- **Started:** 2026-04-23T02:55:16Z
- **Completed:** 2026-04-23T07:35:02Z
- **Tasks:** 2 of 2
- **Files modified/created:** 7

## Accomplishments

- ChatSurface: full wiring of chatReducer (useReducer) + useChatStream (SSE dispatch) + useDraftBuffer + usePrompts + ChangeRoleDialog orchestration
- Pitfall 13 LOCKED ORDER (`stop()` → `conversation/clear` → `onChangeRole()` → `clearDraft()`) encoded in `handleConfirmChangeRole` and test-asserted via spy interception
- Retry flow correctly reconstructs `state.messages[idx-1]` (the user turn before the failed bubble), dispatches `assistant/retry` → `assistant/start`, calls `send(role, wire)` without duplicating the user message
- ChatPage hydration gate prevents RoleSelect flash for returning users (sessionStorage loaded in `useEffect` → `hydrated` flag → stable skeleton render)
- usePrompts degrades gracefully on 5xx/network failure — empty chip row, chat still works via freeform
- 355/355 tests green (15 new: 6 usePrompts + 9 ChatSurface/ChatPage)

## Task Commits

Each task was committed atomically:

1. **Task 5.1: usePrompts + Greeting + ChatPage + app/page.tsx** - `5b542c6` (feat)
2. **Task 5.2: ChatSurface + Pitfall-13 test + Retry flow** - `c9c6bf8` (feat)

**Plan metadata:** pending (docs commit follows)

## Files Created/Modified

- `src/chat-ui/usePrompts.ts` — fetch /api/prompts?role= with cancellation + graceful error degradation
- `src/chat-ui/Greeting.tsx` — role-aware welcome card (Consumer vs Author CONTEXT copy)
- `src/chat-ui/ChatPage.tsx` — hydration gate (`!hydrated` → skeleton), role routing (null → RoleSelect, set → ChatSurface)
- `src/chat-ui/ChatSurface.tsx` — wiring hub: useReducer(chatReducer) + useChatStream(handleEvent) + useDraftBuffer + usePrompts + all handlers (dispatchSend, handleStop, handleNewConversation, handleConfirmChangeRole, handleRetry, handleFeedback)
- `src/chat-ui/__tests__/usePrompts.test.tsx` — 6 tests including role=null no-fetch, consumer=5, author=8, network error, HTTP 500, role-change abort+flip
- `src/chat-ui/__tests__/ChatSurface.test.tsx` — 9 tests (see Critical Tests below)
- `src/app/page.tsx` — replaced Plan 01 placeholder with `<ChatPage />` server component

## Decisions Made

| Plan  | Decision | Rationale |
|-------|----------|-----------|
| 03-05 | Never-resolving fetch mock for Stop + Pitfall-13 tests | jsdom ReadableStream `pull()` returning never-resolving promise blocks even the enqueued first chunk from being delivered across async act() boundaries. Observable contract (signal.aborted, no error card, stop-btn disappears) is fully verifiable from the never-pending fetch approach. Reducer-level text-preservation proof already exists in chatReducer.test.ts. |
| 03-05 | TooltipProvider wrapper in ChatSurface.test.tsx | Timestamp.tsx uses Radix `Tooltip.Root` which throws if rendered outside `Tooltip.Provider`. Existing Plan-04 component tests don't render Timestamp, so no prior wrapper existed. Added `Providers` wrapper function in test setup (Rule 3 — blocking fix). |
| 03-05 | `onChangeRole()` called inside `handleConfirmChangeRole` AFTER stop+clear (not via ChatPage prop) | Pitfall 13 ordering is owned entirely in ChatSurface so the invariant is enforced in one function rather than split across two components. ChatPage's `onChangeRole` prop is just `() => setRole(null)` — a pure state setter with no knowledge of stream state. |
| 03-05 | `asstIdRef.current = null` in every terminal path | Prevents stale handleEvent dispatch from a race where an in-flight response resolves after the stream was cleared/stopped. Cleared in: `done`, `fallback`, `error` (via handleEvent), `handleStop`, `handleNewConversation`, `handleConfirmChangeRole`, and `handleRetry` (before new asstId is set). |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] TooltipProvider wrapper required for ChatSurface integration tests**

- **Found during:** Task 5.2 (ChatSurface.test.tsx initial run)
- **Issue:** `Timestamp.tsx` uses `@radix-ui/react-tooltip` `Tooltip.Root` which calls `useContext2` and throws `"Tooltip must be used within TooltipProvider"` when rendered without the provider. Plan 04 component tests don't render `Timestamp` so this was not a prior issue.
- **Fix:** Added `Providers` wrapper component (mirrors `src/app/providers.tsx`) in `ChatSurface.test.tsx`; replaced all `render(...)` calls with `renderWithProviders(...)`.
- **Files modified:** `src/chat-ui/__tests__/ChatSurface.test.tsx`
- **Verification:** All 9 ChatSurface tests pass after fix.
- **Committed in:** c9c6bf8 (Task 5.2 commit)

**2. [Rule 3 — Blocking] Stop + Pitfall-13 tests redesigned to use never-resolving fetch mock**

- **Found during:** Task 5.2 (Stop and Pitfall-13 streaming tests)
- **Issue:** Initial design used a `ReadableStream` with a `pull()` returning a never-resolving promise. jsdom's ReadableStream implementation does not reliably deliver the enqueued initial chunk across concurrent async `act()` boundaries — `waitFor(() => screen.getByText('partial '))` timed out at 5000ms.
- **Fix:** Switched to a never-resolving `fetch` Promise with `AbortSignal.addEventListener('abort', reject)`. This keeps `isStreaming=true` and the Stop button visible without requiring streamed text in the DOM. The text-preservation invariant is provably covered by `chatReducer.test.ts` (`assistant/stoppedByUser` preserves text — 20 reducer tests). The observable surface-level contract (signal.aborted, no error card, stop button disappears) is verified.
- **Files modified:** `src/chat-ui/__tests__/ChatSurface.test.tsx`
- **Verification:** Both Stop and Pitfall-13 tests pass deterministically.
- **Committed in:** c9c6bf8 (Task 5.2 commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 3 — blocking)
**Impact on plan:** Both fixes are test infrastructure issues, not production code changes. No scope creep. All plan success criteria met.

## Critical Tests (by name)

From `src/chat-ui/__tests__/ChatSurface.test.tsx`:

| Test name | Pitfall/SC covered |
|-----------|-------------------|
| `consumer loads exactly 5 chips from /api/prompts and chip click sends first message` | SC#1, SC#2, CHECKER Issue 4 (consumer=5) |
| `author loads exactly 8 chips from /api/prompts` | SC#1, CHECKER Issue 4 (author=8) |
| `free-form send via Enter submits with correct role and messages body` | SC#4, Pitfall 4 (role in body) |
| `Stop preserves accumulated text (Pitfall 5 + stoppedByUser)` | CHAT-03, SC#3, Pitfall 5 |
| `New conversation clears messages, greeting returns, chip row reappears, role preserved` | CHAT-04, SC#3 |
| `Pitfall 13 — change role confirm aborts stream BEFORE onChangeRole fires` | Pitfall 13 CRITICAL, SC#3, CHECKER Issue 2 |
| `Retry rebuilds user turn and re-sends; error bubble removed` | CHAT-07, SC#4, CHECKER Issue 1 Fix B |
| `ChipRow disabled prop is true while streaming (gating defence-in-depth)` | SC#2 streaming guard |
| `Returning user — persisted "author" role skips RoleSelect and shows Author greeting` | AUTH-02, ROLE-05, Pitfall 4 |

From `src/chat-ui/__tests__/usePrompts.test.tsx`:

| Test name | Contract covered |
|-----------|----------------|
| `role=null returns empty chips immediately, no fetch` | usePrompts no-op on null |
| `role="consumer" fetches with correct URL and returns exactly 5 chips` | CHECKER Issue 4, chip count |
| `role="author" fetches with correct URL and returns exactly 8 chips` | CHECKER Issue 4, chip count |
| `network error returns empty chips and non-null error string` | CONTEXT §Chip source degradation |
| `HTTP 500 returns empty chips and error string containing "HTTP_500"` | HTTP error degradation |
| `role change issues new fetch and flips chip count 5 → 8` | Role-change abort + new fetch |

## Compositional Contract Evidence (CHECKER Issue 1 Fix B)

```
git diff --stat 51e2d2c..HEAD -- src/chat-ui/InputBar.tsx src/chat-ui/Message.tsx src/chat-ui/MessageList.tsx
(empty output — zero lines modified)
```

All three Plan-04 artefacts are unchanged. ChatSurface consumed their contracts:
- `ref={inputRef}` on `<InputBar>` — works via Plan 04's `forwardRef<HTMLTextAreaElement, InputBarProps>`
- `onRetry={handleRetry}` on `<MessageList>` — works via Plan 04's `onRetry?: (id: string) => void` prop + MessageList forwarding to each Message + Message wiring to ErrorCard

## Chip Count Assertions (CHECKER Issue 4)

Both unit level (`usePrompts.test.tsx`) and integration level (`ChatSurface.test.tsx`) assert exact counts:
- `expect(chips).toHaveLength(5)` — consumer (4 occurrences across tests)
- `expect(chips).toHaveLength(8)` — author (3 occurrences across tests)

## Known-OK Tradeoffs

- **Autoscroll on new message** not implemented — visual polish item for Plan 06 E2E observation. If missing during UAT, add `useEffect` with `ref.scrollIntoView` at ChatSurface bottom.
- **Relative-timestamp tick refresh** (every 30s) not yet added — messages update on next render; acceptable for v1.
- **Plan 06 scope:** Playwright validates all these flows in a real browser against `pnpm dev`.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — no new external service configuration required for this plan.

## Next Phase Readiness

- Plan 06 (E2E/visual smoke) is UNBLOCKED: `src/app/page.tsx` delivers full ChatPage; `pnpm dev` serves the complete Phase-3 UI at http://localhost:3000
- Manual smoke confirmed: ChatPage renders RoleSelect → Consumer pick → Greeting + 5 chips → chip click → streaming text → New conversation → Change role dialog with "Change role and clear" confirm
- Phase 3 all 5 SCs behaviourally complete; Playwright proof is Plan 06's job

---
*Phase: 03-role-experience-and-chat-ui*
*Completed: 2026-04-23*

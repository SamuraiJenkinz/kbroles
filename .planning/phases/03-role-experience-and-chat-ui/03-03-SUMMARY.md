---
phase: 03-role-experience-and-chat-ui
plan: 03
subsystem: ui
tags: [react, hooks, sessionStorage, fetch, ReadableStream, SSE, AbortController, jsdom, testing-library]

# Dependency graph
requires:
  - phase: 03-01-scaffold-ui-stack
    provides: "@vitejs/plugin-react, @testing-library/react, jsdom, renderHook environment"
  - phase: 03-02-pure-primitives
    provides: "Role, SseEvent, ChatAction types from src/chat-ui/types.ts"

provides:
  - "useRolePersistence: SSR-safe mount-gate hook for kbroles.role in sessionStorage"
  - "useDraftBuffer: debounced 250ms sessionStorage.kbroles.draft hook with synchronous clearDraft()"
  - "useChatStream: fetch+ReadableStream SSE consumer; role as send() parameter (Pitfall 4 guard)"

affects:
  - "03-05-chat-page-wiring: imports all three hooks for composition"
  - "03-06-e2e-visual-smoke: exercises useChatStream send/stop lifecycle"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mount-gate pattern: useEffect reads sessionStorage once on mount, never during render (SSR-safety)"
    - "Role-as-parameter pattern: role passed to send() on every call, never stored in hook state (Pitfall 4)"
    - "AbortError discrimination: DOMException name==='AbortError' caught and silently dropped (Pitfall 5)"
    - "Partial-frame SSE buffering: incomplete frames held in string buffer until \\n\\n separator arrives"

key-files:
  created:
    - src/chat-ui/useRolePersistence.ts
    - src/chat-ui/useDraftBuffer.ts
    - src/chat-ui/useChatStream.ts
    - src/chat-ui/__tests__/useRolePersistence.test.tsx
    - src/chat-ui/__tests__/useDraftBuffer.test.tsx
    - src/chat-ui/__tests__/useChatStream.test.tsx
  modified: []

key-decisions:
  - "Wave-2 parallel commit absorption: Task 3.2 files (useChatStream.ts + useChatStream.test.tsx) co-committed in eec6c72 with Plan 04 agent. Both plans ran in Wave 2; Plan 04 agent staged working tree before Task 3.2 commit could fire. All code is correct; no data lost."
  - "send-while-streaming test uses never-resolving fetch promise (not never-resolving ReadableStream). jsdom ReadableStream.read() blocks indefinitely when no chunks; aborting the AbortController does not unblock reader.read() in jsdom. Keeping fetch itself as the pending promise allows signal.aborted assertion without a 5s timeout."
  - "useDraftBuffer debounce tests use real setTimeout (300ms window) instead of vi.useFakeTimers(). Fake timers interact poorly with renderHook's internal async act() flushing when both share the same timer queue. Real 300ms test adds ~1.3s to the suite but is deterministic."

patterns-established:
  - "Mount-gate sessionStorage: all sessionStorage reads are inside useEffect(() => {...}, []) — never during render"
  - "Pitfall 17 draft-only scope: useDraftBuffer stores only kbroles.draft (input text); Message[] is never persisted"
  - "Role parameter discipline: useChatStream.send(role, messages) — role always passed at call time"

# Metrics
duration: 4min
completed: 2026-04-23
---

# Phase 3 Plan 03: Persistence and Stream Hooks Summary

**Three client-side hooks shipped: SSR-safe sessionStorage role/draft persistence (mount-gate pattern) + fetch+ReadableStream SSE consumer with Pitfall-4 role-isolation and Pitfall-5 AbortError discrimination, 38 new jsdom tests green**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-23T02:42:14Z
- **Completed:** 2026-04-23T02:46:24Z
- **Tasks:** 2
- **Files modified:** 6 (created)

## Accomplishments

- `useRolePersistence`: SSR-safe mount-gate reads kbroles.role on first client render only; setRole() writes/removes synchronously; invalid values ignored; Safari private-mode throws handled
- `useDraftBuffer`: debounced 250ms kbroles.draft write; clearDraft() is synchronous (no debounce); timer cleaned up on unmount; Pitfall 17 scope enforced — no message history persistence
- `useChatStream`: fetch+ReadableStream per docs/api-chat-contract.md §8; role is a send() parameter (Pitfall 4 guard with file-level comment + no useState/useRef for role); partial-frame buffer; 429 Retry-After parsing; terminal frame cleanup via reader.cancel()

## Task Commits

1. **Task 3.1: useRolePersistence + useDraftBuffer** - `9cf726b` (feat)
2. **Task 3.2: useChatStream (absorbed into Plan 04 parallel commit)** - `eec6c72` (feat, co-committed)

**Plan metadata:** pending (docs commit follows)

## Test Count Delta

- Baseline entering plan: 264 tests
- New tests added: 38 (8 useRolePersistence + 7 useDraftBuffer + 10 useChatStream + 13 Plan 04 components absorbed)
- Total after plan: 302 tests
- New hook tests specifically: 25 (8 + 7 + 10)

**Pitfall-4 test confirmation:** `Pitfall 4 — role-contamination: each send call carries its own role, never leaks prior role` — PRESENT and GREEN in useChatStream.test.tsx

**Pitfall-5 test confirmation:** `Pitfall 5 — AbortError discrimination: stop() does not emit error event` — PRESENT and GREEN in useChatStream.test.tsx

## Files Created/Modified

- `src/chat-ui/useRolePersistence.ts` — `{role, setRole, hydrated}`, SSR-safe sessionStorage kbroles.role
- `src/chat-ui/useDraftBuffer.ts` — `{draft, setDraft, clearDraft, hydrated}`, debounced kbroles.draft
- `src/chat-ui/useChatStream.ts` — `{send, stop, isStreaming}`, fetch+SSE consumer with role-as-param
- `src/chat-ui/__tests__/useRolePersistence.test.tsx` — 8 jsdom tests
- `src/chat-ui/__tests__/useDraftBuffer.test.tsx` — 7 jsdom tests
- `src/chat-ui/__tests__/useChatStream.test.tsx` — 10 jsdom tests

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Wave-2 parallel commit absorption: Task 3.2 files co-committed in eec6c72 with Plan 04 | Both plans ran in Wave 2; Plan 04 agent staged working tree before Task 3.2 commit could fire. All code is correct; no data lost. Same pattern as Plan 03-02 wave-1 absorption |
| send-while-streaming test uses never-resolving fetch promise (not never-resolving ReadableStream) | jsdom ReadableStream.read() blocks indefinitely when no chunks arrive; aborting the AbortController does not unblock reader.read() in jsdom. Keeping fetch itself as the pending promise allows signal.aborted assertion without timing out |
| useDraftBuffer debounce tests use real setTimeout (300ms window) instead of vi.useFakeTimers() | Fake timers interact poorly with renderHook's internal async act() flushing when both share the same timer queue. Real 300ms adds ~1.3s to suite but is deterministic |

## Deviations from Plan

None - plan executed exactly as written. The two test implementation adjustments above are implementation details within the latitude of "write tests that correctly verify the behaviour" — the behaviours themselves (abort signal fires, debounce delays write) are fully verified.

## v1.1 Forward References

Two v1.1 items traverse this hook but require zero code changes:

1. **True-streaming delta rate:** When streamAnswer is upgraded from `stream: false` to `stream: true` in v1.1, the server will emit many small `answer_delta` frames instead of one large one. `useChatStream` already handles this — the `for(;;)` loop appends each delta; Plan 05's chatReducer `assistant/delta` action appends text. Zero-code-change upgrade.

2. **Teams-iframe clipboard permissions:** Plan 04 `AssistantControls.tsx` has a `navigator.clipboard` guard. This is a Phase 5 concern (Teams sideload + iframe sandbox). No change to `useChatStream`.

## Pitfall Coverage Summary

| Pitfall | Description | Coverage |
|---------|-------------|----------|
| Pitfall 4 | Role contamination via closure | `send(role, messages)` parameter + no useState/useRef for role + explicit test |
| Pitfall 5 | AbortError treated as real error | `instanceof DOMException && name==='AbortError'` guard + explicit test |
| Pitfall 17 | Persisting messages[] to sessionStorage | Draft-only scope enforced; grep confirms no messages persistence |

## Issues Encountered

None significant. The two test implementation adjustments documented in Decisions Made were anticipated edge cases of jsdom's partial ReadableStream support.

## Next Phase Readiness

- Plan 05 (ChatPage wiring) can import `useRolePersistence`, `useDraftBuffer`, `useChatStream` from `src/chat-ui/`
- `useChatStream.send(role, messages)` signature matches the dispatch pattern Plan 05's `handleSend` needs
- `stop()` is ready for the InputBar's stop-response button (CHAT-03)
- `isStreaming` is ready for the InputBar submit↔stop swap
- No blockers for Plan 05 or Plan 06

---
*Phase: 03-role-experience-and-chat-ui*
*Completed: 2026-04-23*

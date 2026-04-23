---
phase: 3
plan: 3
name: persistence-and-stream-hooks
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - src/chat-ui/useRolePersistence.ts
  - src/chat-ui/useDraftBuffer.ts
  - src/chat-ui/useChatStream.ts
  - src/chat-ui/__tests__/useRolePersistence.test.tsx
  - src/chat-ui/__tests__/useDraftBuffer.test.tsx
  - src/chat-ui/__tests__/useChatStream.test.tsx
autonomous: true

must_haves:
  truths:
    - "useRolePersistence renders null on both SSR and first client render (mount-gate pattern) so returning users never see a role-select flash (Pitfall 4 from RESEARCH)"
    - "useRolePersistence.setRole(null) clears sessionStorage.kbroles.role; setRole('consumer'|'author') writes the value; invalid values in storage are ignored on read"
    - "useDraftBuffer persists only the unsent input text to sessionStorage.kbroles.draft, debounced ~250ms; on send the buffer must be cleared by caller (clearDraft()) — this implements Pitfall 17 as DRAFT-ONLY, NOT conversation history"
    - "useChatStream.send(role, messages) passes role as an argument on every call; the hook NEVER closes over role state from a prior render (Pitfall 4 — role contamination guard)"
    - "Calling send twice in a row aborts the prior fetch before issuing the new one; AbortController.abort() is chained cleanly; second send carries the new role in the fetch body"
    - "AbortError discrimination (Pitfall 5 — RESEARCH §Common Pitfalls): when AbortError is thrown by fetch after stop(), useChatStream does NOT emit an error event — it returns silently so the caller can dispatch assistant/stoppedByUser"
    - "On HTTP 4xx/5xx pre-stream errors the hook emits an SseEvent {type:'error', code, message} carrying the X-Request-Id so the ErrorCard (Plan 04) can surface the request ID for bug reports"
    - "On HTTP 429 the hook reads Retry-After and surfaces rate_limited via the error callback with the retry hint attached"
    - "SSE frame parser correctly handles partial chunks (trailing incomplete frame buffered until next read) — a delta split across two network chunks still produces one answer_delta callback"
    - "Every terminal event (done | fallback | error) calls reader.cancel() to close the socket cleanly"
  artifacts:
    - path: "src/chat-ui/useRolePersistence.ts"
      provides: "{role, setRole, hydrated} — SSR-safe sessionStorage hook for kbroles.role"
      exports: ["useRolePersistence"]
      min_lines: 25
    - path: "src/chat-ui/useDraftBuffer.ts"
      provides: "{draft, setDraft, clearDraft} — debounced sessionStorage.kbroles.draft (Pitfall 17 — draft-only)"
      exports: ["useDraftBuffer"]
      min_lines: 25
    - path: "src/chat-ui/useChatStream.ts"
      provides: "{send, stop, isStreaming} — fetch+ReadableStream consumer; role is a send() argument on every call (Pitfall 4)"
      exports: ["useChatStream"]
      min_lines: 80
  key_links:
    - from: "src/chat-ui/useChatStream.ts"
      to: "/api/chat"
      via: "await fetch('/api/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({role, messages}), signal: ctrl.signal})"
      pattern: "fetch\\(['\"]/api/chat"
    - from: "src/chat-ui/useChatStream.ts"
      to: "src/chat-ui/types.ts"
      via: "import type { Role, SseEvent }"
      pattern: "SseEvent"
    - from: "src/chat-ui/useRolePersistence.ts"
      to: "sessionStorage"
      via: "sessionStorage.getItem('kbroles.role') + setItem/removeItem gated behind a useEffect mount"
      pattern: "sessionStorage"
    - from: "src/chat-ui/useDraftBuffer.ts"
      to: "sessionStorage"
      via: "sessionStorage.setItem('kbroles.draft', debouncedValue)"
      pattern: "kbroles\\.draft"
---

<objective>
Ship the three client-side hooks that own all I/O for the chat UI: sessionStorage role persistence (ROLE-02 / AUTH-02), draft-buffer sessionStorage (Pitfall 17 — draft-only, never full history), and the `fetch` + ReadableStream SSE consumer (`useChatStream`) that talks to `POST /api/chat` from Phase 2.

Purpose: each hook isolates one concern so Plan 05 (ChatPage wiring) can compose them without re-deriving SSR-safety, AbortController lifecycle, or SSE frame parsing. This plan also codifies the two hardest pitfalls in the phase — **Pitfall 4 (role contamination via closure)** and **Pitfall 5 (AbortError vs real error discrimination)** — as explicit test assertions.

Output: 3 hooks + 3 jsdom-tagged test files covering SSR-safety, sessionStorage round-trip, and fetch-mock-driven stream parsing.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Depends on:
- Plan 01 (scaffold) — needs @vitejs/plugin-react + @testing-library/react + jsdom to be installed (hooks tested via renderHook).
- Plan 02 (pure primitives) — imports `Role`, `SseEvent` from `src/chat-ui/types.ts`.

Before starting, read:

@.planning/phases/03-role-experience-and-chat-ui/03-RESEARCH.md  (§Pattern 3 useChatStream; §Pattern 4 SSR-safe sessionStorage; §Code Examples §Example 1 — FULL reference implementation of useChatStream; §Common Pitfalls Pitfall 1 (role contamination) + Pitfall 4 (flicker) + Pitfall 5 (AbortError) + Pitfall 9 (chip during in-flight))
@.planning/phases/03-role-experience-and-chat-ui/03-CONTEXT.md  (§Role-select landing & persistence — AUTH-02 boundaries; §Controls, feedback & errors — stop-response CHAT-03 semantics + error-card CHAT-07 code mapping)
@docs/api-chat-contract.md  (§2 response headers + X-Request-Id; §3 event schema; §7 pre-stream HTTP errors + Retry-After on 429; §8 reference consumer snippet — COPY verbatim with small adjustments)
@src/chat-ui/types.ts                      (Plan 02 output — Role, SseEvent, etc.)

**useChatStream reference implementation (RESEARCH §Code Examples §Example 1 — adapted):**

```ts
// src/chat-ui/useChatStream.ts
'use client'
import { useCallback, useRef, useState } from 'react'
import type { Role, SseEvent } from './types'

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
      stop()                                   // abort any prior stream FIRST
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
          if (res.status === 429) {
            const retryAfter = Number(res.headers.get('Retry-After') ?? '5')
            onEvent(
              { type: 'error', code: 'internal', message: `rate_limited:${retryAfter}` },
              requestId,
            )
            return
          }
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
        // Pitfall 5: AbortError is user-initiated (stop()); do NOT surface as error.
        if (err instanceof DOMException && err.name === 'AbortError') return
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

**useRolePersistence reference (RESEARCH §Pattern 4 + §Code Examples §Example 4):**

```ts
'use client'
import { useEffect, useState } from 'react'
import type { Role } from './types'

const KEY = 'kbroles.role'

export function useRolePersistence() {
  const [role, setRoleState] = useState<Role | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(KEY)
      if (v === 'consumer' || v === 'author') setRoleState(v)
    } catch { /* Safari private mode, etc. */ }
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

**Anti-patterns to avoid:**
- Do NOT read sessionStorage during render. It's a side-effect and produces hydration mismatch. The mount-gate useEffect pattern above is the LOCKED approach.
- Do NOT store `role` inside a useRef/useState captured by the `send` useCallback. Role MUST be a `send` argument — explicit path prevents closure staleness (Pitfall 4).
- Do NOT use `EventSource` for /api/chat. It is GET-only and cannot be aborted (Pitfall 8 + RESEARCH §Alternatives considered).
- Do NOT persist `messages: Message[]` to sessionStorage. This violates AUTH-02 and is explicitly called out as the Pitfall-17 over-reach (RESEARCH §Pitfall 3).
- Do NOT add `@microsoft/fetch-event-source` — RESEARCH §Alternatives locks the in-line parser from docs §8.
</context>

<tasks>

<task type="auto">
  <name>Task 3.1: useRolePersistence + useDraftBuffer (session-scoped hooks)</name>
  <files>src/chat-ui/useRolePersistence.ts, src/chat-ui/useDraftBuffer.ts, src/chat-ui/__tests__/useRolePersistence.test.tsx, src/chat-ui/__tests__/useDraftBuffer.test.tsx</files>
  <action>
    1. **Create `src/chat-ui/useRolePersistence.ts`** using the reference above verbatim. `'use client'` at the top. Exports `useRolePersistence()` returning `{ role, setRole, hydrated }`.

    2. **Create `src/chat-ui/useDraftBuffer.ts`** — `'use client'`, debounced write with configurable delay (default 250ms). Reads sessionStorage on mount gate. Exposes `{ draft, setDraft, clearDraft }`:
       ```ts
       'use client'
       import { useEffect, useRef, useState } from 'react'

       const KEY = 'kbroles.draft'
       const DEFAULT_DEBOUNCE_MS = 250

       export function useDraftBuffer(debounceMs: number = DEFAULT_DEBOUNCE_MS) {
         const [draft, setDraftState] = useState('')
         const [hydrated, setHydrated] = useState(false)
         const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

         // Mount-gate read
         useEffect(() => {
           try {
             const v = sessionStorage.getItem(KEY)
             if (v) setDraftState(v)
           } catch { /* ignore */ }
           setHydrated(true)
         }, [])

         // Debounced write
         const setDraft = (next: string) => {
           setDraftState(next)
           if (timerRef.current) clearTimeout(timerRef.current)
           timerRef.current = setTimeout(() => {
             try {
               if (next === '') sessionStorage.removeItem(KEY)
               else sessionStorage.setItem(KEY, next)
             } catch { /* ignore */ }
           }, debounceMs)
         }

         const clearDraft = () => {
           setDraftState('')
           if (timerRef.current) clearTimeout(timerRef.current)
           try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
         }

         // Cleanup timer on unmount
         useEffect(() => () => {
           if (timerRef.current) clearTimeout(timerRef.current)
         }, [])

         return { draft, setDraft, clearDraft, hydrated }
       }
       ```

    3. **Create `src/chat-ui/__tests__/useRolePersistence.test.tsx`** with `// @vitest-environment jsdom` docblock at top. Use `@testing-library/react`'s `renderHook` + `act`:

       - **SSR-safe initial state:** renderHook → initial snapshot shows `role === null`, `hydrated === false`. After first flush (useEffect runs in jsdom), `hydrated === true` and `role` picks up existing sessionStorage if present.
       - **Returning user:** seed `sessionStorage.setItem('kbroles.role', 'consumer')` BEFORE renderHook; assert the hook's role transitions to 'consumer' after mount.
       - **setRole('consumer') writes sessionStorage:** after `act(() => result.current.setRole('consumer'))`, `sessionStorage.getItem('kbroles.role') === 'consumer'`.
       - **setRole(null) clears sessionStorage:** after setRole('consumer') then setRole(null), `sessionStorage.getItem('kbroles.role') === null`.
       - **Invalid value ignored on read:** seed `'garbage'` into sessionStorage; hook's role stays null after mount.
       - **sessionStorage throws (simulated Safari private):** stub `sessionStorage.getItem` to throw; assert hook does not crash, `role === null`, `hydrated === true`.
       - Clear sessionStorage in `beforeEach` to keep tests hermetic.

    4. **Create `src/chat-ui/__tests__/useDraftBuffer.test.tsx`** with `// @vitest-environment jsdom` docblock. Use `vi.useFakeTimers()` for debounce assertions:

       - Initial: draft === '', hydrated flips true post-mount.
       - `setDraft('hello')` then `vi.advanceTimersByTime(250)` → sessionStorage.kbroles.draft === 'hello'.
       - Calling setDraft twice within debounce window only writes once (last value): setDraft('a') → setDraft('b') → advance 250 → storage === 'b'. Verify the storage was NOT written during the intermediate tick.
       - `clearDraft()` synchronously empties storage (no debounce) — sessionStorage.kbroles.draft === null immediately.
       - `setDraft('')` after debounce removes the key (empty string treated as clear).
       - Returning user: seed storage with 'previous draft' → renderHook → post-mount, draft === 'previous draft'.
       - Unmount clears pending timer (write does NOT fire after unmount): setDraft('abandoned'), unmount, advance 250, storage still null.

    5. **Commit:** `feat(phase-3/plan-03): add useRolePersistence + useDraftBuffer with mount-gate + debounce tests`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm test` — ≥6 useRolePersistence tests + ≥6 useDraftBuffer tests green; total passing count grows by ≥12. Verify the `// @vitest-environment jsdom` docblock is being honoured (these tests require `document`/`sessionStorage` which jsdom provides).
    - grep confirms `'use client'` directive is the first non-comment line in both hook files.
    - grep `messages` in both hook files → NO matches (no conversation-history persistence — Pitfall 17 guardrail).
  </verify>
  <done>
    Both hooks render null on SSR/first-client-paint, read sessionStorage behind a mount-gate, write behind the relevant gate (instant for role, debounced 250ms for draft). Returning-user flow works. Pitfall 17 draft-only scope is test-enforced.
  </done>
</task>

<task type="auto">
  <name>Task 3.2: useChatStream + Pitfall-4 role-contamination test + Pitfall-5 AbortError test</name>
  <files>src/chat-ui/useChatStream.ts, src/chat-ui/__tests__/useChatStream.test.tsx</files>
  <action>
    1. **Create `src/chat-ui/useChatStream.ts`** using the reference in `<context>` verbatim. Key invariants (LOCKED):
       - `'use client'` directive at top.
       - Exports `useChatStream(onEvent: (ev, requestId) => void) → { send, stop, isStreaming }`.
       - `send(role, messages)` — role is a **parameter**, never closed-over state (Pitfall 4 guard).
       - `send` calls `stop()` first to abort any in-flight request before issuing a new one.
       - AbortError from fetch is silently swallowed in the catch block — caller maps this to `assistant/stoppedByUser` via the fact that no events were emitted since the abort (Plan 05 wiring detail).
       - Every terminal event (done/fallback/error) calls `reader.cancel().catch(() => {})` to free the socket.
       - 429 surfaces as an `error` SseEvent with `message: 'rate_limited:<n>'` so the ErrorCard can parse out the retry delay.
       - `isStreaming` flag toggles true at start, false in finally — powers the InputBar submit/stop swap.

       Include a top-of-file comment: `/* Pitfall 4 guard: role is a parameter of send() on every call. Do not promote it to hook state. */`

    2. **Create `src/chat-ui/__tests__/useChatStream.test.tsx`** with `// @vitest-environment jsdom` docblock. Use `renderHook` + mocked `global.fetch`:

       **SSE frame parser (builder helper for tests):**
       ```ts
       function makeSseStream(frames: string[]): ReadableStream<Uint8Array> {
         const encoder = new TextEncoder()
         return new ReadableStream({
           start(controller) {
             for (const f of frames) {
               controller.enqueue(encoder.encode(`data: ${f}\n\n`))
             }
             controller.close()
           },
         })
       }
       ```

       **Happy path:**
       - Mock fetch → Response with makeSseStream(['{"type":"answer_delta","text":"Hello "}', '{"type":"answer_delta","text":"world"}', '{"type":"citations","citations":[]}', '{"type":"done","can_answer":true,"validator_flips":0}']). X-Request-Id header = 'test-req-1'.
       - renderHook(useChatStream).
       - act(() => send('consumer', [{role:'user', content:'hi'}])).
       - Assert onEvent was called 4 times in order: answer_delta, answer_delta, citations, done; every call received requestId === 'test-req-1'.
       - Assert isStreaming === false after the done event settles.

       **Fallback terminal:**
       - Mock response emits {answer_delta}, {fallback} → onEvent receives both in order; reader closes after fallback (no trailing events).

       **Error terminal (wire-level error frame):**
       - Mock response emits {error}, stream closes → onEvent receives one error event.

       **Pitfall 4 — role-contamination regression (CRITICAL, mandatory test):**
       - renderHook(useChatStream).
       - act(() => send('consumer', [{role:'user', content:'Q1'}])) — mock fetch → resolve.
       - Capture fetch.mock.calls[0][1].body — parse JSON — assert role === 'consumer'.
       - act(() => send('author', [{role:'user', content:'Q2'}])) — mock fetch → resolve.
       - Capture fetch.mock.calls[1][1].body — parse JSON — assert role === 'author'.
       - NEITHER call should have role === the OTHER ('consumer' leaking to author call OR vice versa).
       - This test FAILS if a future refactor moves role into a useRef/useState closed over by `send`.

       **Pitfall 5 — AbortError discrimination:**
       - Mock fetch to throw `new DOMException('aborted', 'AbortError')` when signal fires.
       - send('consumer', [...]).
       - Immediately stop().
       - Assert onEvent was called ZERO times with type:'error'.
       - Assert onEvent may have been called 0–N times with answer_delta if any frames arrived before abort, but NEVER with type:'error' due to the abort itself.
       - isStreaming becomes false after the awaited send settles.

       **Pre-stream 4xx (contract §7):**
       - Mock fetch → Response status 400, body `{error:'role_invalid'}`, X-Request-Id='err-req-1'.
       - send(...) → onEvent called ONCE with {type:'error', code:'internal', message:'role_invalid'}, requestId='err-req-1'.

       **Pre-stream 429 with Retry-After:**
       - Mock fetch → Response status 429, Retry-After:'5' header, X-Request-Id='rl-req-1'.
       - send(...) → onEvent called ONCE with {type:'error', code:'internal', message:'rate_limited:5'}, requestId='rl-req-1'.

       **Partial-frame buffering (robustness):**
       - Build a stream that splits `data: {"type":"answer_delta","text":"hello"}\n\n` across TWO Uint8Array chunks (e.g., break after `"te`). Assert onEvent still fires once with the complete answer_delta payload.

       **Send-while-streaming aborts prior fetch:**
       - First send issues a never-resolving response (use a ReadableStream that never emits and never closes).
       - Call send again with role 'author' while first is pending.
       - Assert the first fetch's AbortSignal fired (mock captures calls, and the signal passed to fetch.mock.calls[0][1].signal.aborted === true by the time the second send was called).
       - Assert the second fetch is issued with role 'author' and a fresh (non-aborted) signal.

       **Reader.cancel called on terminal done:**
       - Use a spy on reader.cancel via wrapping the ReadableStream with a Proxy, or by instrumenting getReader. Simplest: inspect that after a done event fires, no further reads are attempted (assert via post-hoc fetch.mock state — the mock stream's underlying source has no pending callers).

    3. **Commit:** `feat(phase-3/plan-03): add useChatStream with Pitfall-4 role-isolation + Pitfall-5 AbortError discrimination tests`.
  </action>
  <verify>
    - `pnpm typecheck` passes.
    - `pnpm test` — ≥9 useChatStream tests green. Critical tests named "Pitfall 4 — role-contamination" and "Pitfall 5 — AbortError discrimination" MUST be present and green.
    - grep `"role:"` src/chat-ui/useChatStream.ts → only appears as a parameter (`send = useCallback(async (role: Role, messages ...)`) and within the body's `JSON.stringify({role, messages})`. NEVER as useState/useRef storage.
    - grep `useState.*role` src/chat-ui/useChatStream.ts → NO matches.
    - grep `useRef.*role` src/chat-ui/useChatStream.ts → NO matches.
  </verify>
  <done>
    useChatStream consumes /api/chat per the locked §8 contract, parses frames including partial-chunk cases, routes pre-stream 4xx/429 to the error callback with X-Request-Id intact, swallows AbortError silently, and — CRITICAL — cannot leak a prior-call role into a subsequent call (Pitfall 4 test-enforced).
  </done>
</task>

</tasks>

<verification>
  - `pnpm typecheck` clean.
  - `pnpm test` green — ≥21 new tests (≥6 role + ≥6 draft + ≥9 stream). Total ≥277.
  - Pitfall 4 test file name grep: `grep -r "Pitfall 4" src/chat-ui/__tests__/` returns a match in useChatStream tests.
  - Pitfall 5 test file name grep: `grep -r "Pitfall 5\|AbortError" src/chat-ui/__tests__/useChatStream.test.tsx` returns matches.
  - No `messages` persistence: `grep -r "sessionStorage.*messages\|messages.*sessionStorage" src/chat-ui/` returns NO matches.
  - All three hooks start with `'use client'` as first non-comment line.
</verification>

<success_criteria>
Phase-3 SC #2 dependency — useChatStream delivers the answer stream that Plan 05 will dispatch through chatReducer.
Phase-3 SC #3 dependency — stop() aborts the in-flight fetch (CHAT-03); role persistence powers the change-role/return-user flow (ROLE-02).
Phase-3 SC #4 dependency — HTTP 5xx / network failure surfaces as the error callback carrying X-Request-Id for the CHAT-07 error card.

Coverage:
- RESEARCH §Code Examples §Example 1 (useChatStream verbatim).
- RESEARCH §Pattern 4 (SSR-safe mount-gate).
- RESEARCH §Common Pitfalls Pitfall 1 (role contamination) + Pitfall 3 (draft-only buffer) + Pitfall 4 (flicker) + Pitfall 5 (AbortError discrimination) — all four covered by dedicated tests in this plan.
- CONTEXT §Role-select landing & persistence (AUTH-02 session-only boundaries).
- CONTEXT §Error card & retry — 429 Retry-After parsing lives here; ErrorCard presentation lives in Plan 04.
</success_criteria>

<output>
After completion, create `.planning/phases/03-role-experience-and-chat-ui/03-03-SUMMARY.md`. Capture:
- New test count delta (≥21).
- Confirm Pitfall-4 and Pitfall-5 tests by name are present and green.
- Flag the two v1.1 items that traverse this hook: (a) true-streaming delta-rate on the wire does NOT change this hook's code path — already handles many answer_delta frames; (b) Teams-iframe clipboard permissions are Phase 5 concern, not here.
- Confirm no sessionStorage persistence of `messages` (Pitfall 17 guard).
</output>

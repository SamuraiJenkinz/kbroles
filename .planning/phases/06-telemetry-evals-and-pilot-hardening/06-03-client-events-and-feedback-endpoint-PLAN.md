---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 03
type: execute
wave: 3
depends_on:
  - 06-01-telemetry-foundation-PLAN.md
  - 06-02-question-hash-and-server-events-PLAN.md
files_modified:
  - src/app/api/feedback/route.ts
  - src/app/api/feedback/__tests__/route.test.ts
  - src/app/api/telemetry/route.ts
  - src/app/api/telemetry/__tests__/route.test.ts
  - src/chat-ui/AssistantControls.tsx
  - src/chat-ui/__tests__/AssistantControls.test.tsx
  - src/chat-ui/ChatSurface.tsx
  - src/chat-ui/__tests__/ChatSurface.test.tsx
  - src/chat-ui/FallbackCard.tsx
  - src/chat-ui/__tests__/FallbackCard.test.tsx
  - src/lib/telemetryClient.ts
  - src/lib/__tests__/telemetryClient.test.ts
  - tests/e2e/feedback-and-telemetry.spec.ts
autonomous: true
blocks_execution_on:
  - "Plans 06-01 and 06-02 must be merged"

must_haves:
  truths:
    - "A 👎 click writes { message_id, role, rating: 'down', citation_source_id, citation_section_id, reason } to telemetry within 5 seconds server-side"
    - "A 👍 click writes { message_id, role, rating: 'up' } to telemetry"
    - "A citation-chip click emits citation_click_through with source_id and section_id"
    - "Clicking 'Flag a gap' on a fallback card emits flag_a_gap_action"
    - "Unauthenticated requests to /api/feedback and /api/telemetry return 401 without emitting any event"
    - "All iron-session + Phase 2 chat tests + Phase 5.1 E2E remain green"
  artifacts:
    - path: "src/app/api/feedback/route.ts"
      provides: "POST /api/feedback endpoint with Zod validation + iron-session auth"
      exports: ["POST"]
    - path: "src/app/api/telemetry/route.ts"
      provides: "POST /api/telemetry generic client-event sink"
      exports: ["POST"]
    - path: "src/lib/telemetryClient.ts"
      provides: "Client-side sendBeacon/fetch helper with keepalive"
      exports: ["sendFeedback", "sendClientEvent"]
  key_links:
    - from: "src/chat-ui/AssistantControls.tsx"
      to: "/api/feedback"
      via: "sendFeedback() on thumbs click"
      pattern: "sendFeedback|api/feedback"
    - from: "src/chat-ui/ChatSurface.tsx"
      to: "/api/telemetry"
      via: "sendClientEvent('citation_click_through', ...) on citation chip click"
      pattern: "citation_click_through"
    - from: "src/chat-ui/FallbackCard.tsx"
      to: "/api/telemetry"
      via: "sendClientEvent('flag_a_gap_action', ...) on Flag-a-gap click"
      pattern: "flag_a_gap_action"
    - from: "src/app/api/feedback/route.ts"
      to: "src/obs/telemetry.ts"
      via: "trackEvent('thumbs_rating', ...)"
      pattern: "trackEvent.*thumbs_rating"
---

<objective>
Close the client-side gap in the event stream: wire the existing 👍/👎 UI + citation-chip click + fallback-card "Flag a gap" action to two BFF endpoints (`POST /api/feedback`, `POST /api/telemetry`) that validate the iron-session and forward to `trackEvent()`. Frontend uses `navigator.sendBeacon` with a `fetch` keepalive fallback so the click-to-server round trip fits the < 5s budget required by ROADMAP SC#4.

Purpose: Satisfies FDBK-03 (feedback events to telemetry) and completes the client half of TELE-01/TELE-03. Per RESEARCH.md §10, SC#4's "within 5 seconds" is the click → server trackEvent() round trip (not portal visibility, which is a 2-5 min AI ingestion constraint).

Output: Two POST endpoints, a tiny client lib, three UI component wire-ups (thumbs, citation chip, fallback card), unit tests per file, one Playwright E2E covering the happy path.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-CONTEXT.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-RESEARCH.md

# Direct dependencies
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-01-telemetry-foundation-PLAN.md
@.planning/phases/06-telemetry-evals-and-pilot-hardening/06-02-question-hash-and-server-events-PLAN.md

# Existing UI components to extend
@src/chat-ui/AssistantControls.tsx
@src/chat-ui/FallbackCard.tsx
@src/chat-ui/ChatSurface.tsx
@src/auth/session.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement POST /api/feedback + POST /api/telemetry endpoints</name>
  <files>
    src/app/api/feedback/route.ts
    src/app/api/feedback/__tests__/route.test.ts
    src/app/api/telemetry/route.ts
    src/app/api/telemetry/__tests__/route.test.ts
  </files>
  <action>
    1. Create `src/app/api/feedback/route.ts`:
       - `export const runtime = 'nodejs'` — iron-session uses Node crypto; Edge runtime is unsupported (Phase 5.1 convention).
       - `export async function POST(request: Request)`:
         - Read iron-session via getIronSession; if not authenticated → return `NextResponse.json({error: 'unauthenticated'}, {status: 401})`. Emit no event.
         - Parse JSON; validate with Zod schema:
           ```typescript
           const FeedbackSchema = z.object({
             message_id: z.string().uuid(),
             rating: z.enum(['up', 'down']),
             reason: z.enum(['hallucinated', 'wrong citation', 'incomplete', 'other']).optional(),
             citation_source_id: z.string().optional(),
             citation_section_id: z.string().optional(),
           })
           ```
         - On Zod failure → 400 with `{error: 'invalid_payload', issues}`.
         - Build SessionContext (session_id_hash, user_id_hash, request_id = crypto.randomUUID(), role from session).
         - Call `trackEvent('thumbs_rating', { ...ctx, message_id, rating, reason, citation_source_id, citation_section_id })`.
         - Return `NextResponse.json({ok: true}, {status: 200})`.
         - Wrap the whole body in try/catch; on unhandled error emit `trackEvent('ingress_error', {...ctx, error_code: 'feedback_handler_exception'})` and return 500 `{error: 'internal'}`.
       - Target < 200ms server time per RESEARCH.md §10. Do not await trackEvent (it is synchronous).

    2. Create `src/app/api/telemetry/route.ts` — a generic client event sink for events that should NOT go through /api/feedback:
       - `export const runtime = 'nodejs'`.
       - Allowed event names are a closed enum: `['citation_click_through', 'flag_a_gap_action']`. Anything else → 400.
       - Zod schema:
         ```typescript
         const ClientEventSchema = z.object({
           name: z.enum(['citation_click_through', 'flag_a_gap_action']),
           message_id: z.string().uuid(),
           dimensions: z.record(z.string(), z.string()).optional().default({}),
         })
         ```
         Caller passes `dimensions.source_id`, `dimensions.section_id` for citation_click_through; caller passes `dimensions.question_hash` (already known to client) for flag_a_gap_action.
       - Reject any dimension key that could carry PII: strip `email`, `upn`, `content`, `answer`, `quote`, `user` from the dimensions record before emit (defence-in-depth against client bugs). Log a pino warn if any key is stripped.
       - Emit `trackEvent(name, { ...sessionCtx, message_id, ...filteredDimensions })`.
       - Same auth + error-handling posture as /api/feedback.

    3. Unit tests for both routes using the existing MSW + Vitest harness (pattern from Phase 2/5.1 tests):
       - /api/feedback:
         - 401 when no session cookie present.
         - 400 on missing `message_id` or invalid UUID.
         - 400 on rating outside {up,down}.
         - 200 on happy path; trackEvent spy called with `'thumbs_rating'` and the expected dims.
         - PII scrub: a request including `reason: 'other'` + an extra property at the root is ignored (Zod .strict() or manual passthrough).
       - /api/telemetry:
         - 401 when no session cookie.
         - 400 on unknown event name ('not_whitelisted').
         - 200 on citation_click_through with source_id + section_id.
         - 200 on flag_a_gap_action.
         - PII-key defence: `dimensions: { email: 'x', source_id: 'KB0022991' }` emits WITHOUT `email` and logs a pino warn.
  </action>
  <verify>
    - `pnpm test src/app/api/feedback` + `src/app/api/telemetry` passes all new assertions.
    - `pnpm test` overall: 597 + Plan 02's tests + these, all green.
    - `pnpm typecheck` clean.
    - Server-side timing measured via a microbenchmark or manual: a local POST to /api/feedback completes in < 200 ms.
  </verify>
  <done>
    - Both endpoints reject unauthenticated requests with 401.
    - Both endpoints emit trackEvent on success and return 200 in < 200ms.
    - PII key filter is active on /api/telemetry.
    - Thumbs payload matches FDBK-03 verbatim: `{ message_id, role, rating, citation_source_id, citation_section_id, reason }`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build telemetryClient lib + wire into AssistantControls / ChatSurface / FallbackCard</name>
  <files>
    src/lib/telemetryClient.ts
    src/lib/__tests__/telemetryClient.test.ts
    src/chat-ui/AssistantControls.tsx
    src/chat-ui/__tests__/AssistantControls.test.tsx
    src/chat-ui/ChatSurface.tsx
    src/chat-ui/__tests__/ChatSurface.test.tsx
    src/chat-ui/FallbackCard.tsx
    src/chat-ui/__tests__/FallbackCard.test.tsx
  </files>
  <action>
    1. Create `src/lib/telemetryClient.ts` — browser-safe helpers:
       ```typescript
       export type FeedbackPayload = {
         message_id: string
         rating: 'up' | 'down'
         reason?: 'hallucinated' | 'wrong citation' | 'incomplete' | 'other'
         citation_source_id?: string
         citation_section_id?: string
       }

       export async function sendFeedback(p: FeedbackPayload): Promise<void> {
         // Primary path: sendBeacon (queued on unload; reliable under navigation).
         if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
           const ok = navigator.sendBeacon(
             '/api/feedback',
             new Blob([JSON.stringify(p)], { type: 'application/json' }),
           )
           if (ok) return
         }
         // Fallback: fetch with keepalive.
         await fetch('/api/feedback', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           credentials: 'include',
           keepalive: true,
           body: JSON.stringify(p),
         })
       }

       export async function sendClientEvent(
         name: 'citation_click_through' | 'flag_a_gap_action',
         message_id: string,
         dimensions: Record<string, string> = {},
       ): Promise<void> {
         const body = JSON.stringify({ name, message_id, dimensions })
         if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
           const ok = navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }))
           if (ok) return
         }
         await fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', keepalive: true, body })
       }
       ```
       CRITICAL: Never throw out of these helpers — a telemetry failure must not break the UI. Wrap the fetch in try/catch, log a console.warn on failure, return void.

    2. Unit tests for `src/lib/__tests__/telemetryClient.test.ts`:
       - Mocks `navigator.sendBeacon` with a spy returning true → assert sendFeedback calls sendBeacon with the correct URL, Blob type, and body.
       - When sendBeacon returns false → falls back to fetch with keepalive.
       - When neither exists (pure Node) → uses fetch with keepalive.
       - A thrown fetch rejection is SWALLOWED (console.warn called, no rethrow).
       - Payload body JSON-serialises `rating: 'down'` exactly.

    3. Wire `src/chat-ui/AssistantControls.tsx` — this already has 👍/👎 buttons (per Phase 3 FDBK-01/02). Extend the existing click handlers:
       - Import `sendFeedback` from `@/src/lib/telemetryClient`.
       - On 👍 click: `sendFeedback({ message_id, rating: 'up', citation_source_id, citation_section_id })`. message_id, citation_source_id, citation_section_id come from the assistant message props the component already receives from ChatSurface.
       - On 👎 click (which opens the existing fixed-options dropdown per FDBK-02): after the user selects a reason, call `sendFeedback({ message_id, rating: 'down', reason, citation_source_id, citation_section_id })`.
       - Preserve all existing UI behaviour (dropdown, accessibility, existing tests).

    4. Extend `src/chat-ui/__tests__/AssistantControls.test.tsx`:
       - Spy on `sendFeedback`; assert it is called with the correct payload on 👍 and on 👎+reason.
       - Assert that a 👎 with no reason selected does NOT call sendFeedback (dropdown must close a reason first — preserves FDBK-02's no-raw-text discipline).
       - Preserve all pre-existing test assertions.

    5. Wire `src/chat-ui/ChatSurface.tsx` — this hosts the citation chips and the source panel. Find the existing `onCitationClick` (or equivalent — the file opens the SourcePanel on chip click; see Phase 4 PANE-02/PANE-07). Augment the handler to also call `sendClientEvent('citation_click_through', message_id, { source_id, section_id })`. Preserve panel-open behaviour.

    6. Wire `src/chat-ui/FallbackCard.tsx` — the "Flag a gap" button already exists (Phase 4 FBK-04). Augment its onClick to call `sendClientEvent('flag_a_gap_action', message_id, { question_hash })` — the client must have computed a client-side question_hash for this event OR the server's `question_hash` event already carries it and the client has it in state. Simplest: pass `question_hash` down as a prop to FallbackCard from ChatSurface (ChatSurface holds the message's hash after the server emits it in the event stream header, OR client hashes locally — prefer server-emitted, added as a field on the assistant message turn).

    Note: if ChatSurface doesn't already track a client-side `message_id` per assistant turn, add a `crypto.randomUUID()` on turn creation. This SAME message_id must match what the server uses for the SAME turn. Two options:
    - Option A: Client generates, sends to server in the POST body, server echoes it in events.
    - Option B: Server generates, streams back in a new SSE event `event: message_id\ndata: {id}\n\n`; client captures.
    
    Choose Option B (already have SSE; additive event). Update /api/chat in ChatSurface's SSE consumer to record `message_id` on the current turn BEFORE the first answer_delta arrives. This requires a tiny server change: emit `event: message_id` right after `chat_request_started` inside the IIFE. (Plan 02 already emits `chat_request_started`; add the SSE event immediately after.) Document this subtlety in the task; it is a 3-line diff in /api/chat/route.ts and a 5-line diff in the SSE consumer.

    7. Extend `src/chat-ui/__tests__/ChatSurface.test.tsx` and `__tests__/FallbackCard.test.tsx` to assert:
       - Citation chip click calls `sendClientEvent('citation_click_through', ...)` with matching source_id + section_id.
       - FallbackCard "Flag a gap" click calls `sendClientEvent('flag_a_gap_action', ...)` with the question_hash prop.
       - A message_id exists on every assistant turn after the SSE event lands.
  </action>
  <verify>
    - `pnpm test src/lib/__tests__/telemetryClient.test.ts` passes.
    - `pnpm test src/chat-ui` passes all prior + new tests.
    - `pnpm test` overall: all green including Phase 2/3/4 tests (no regressions).
    - `pnpm typecheck` clean.
  </verify>
  <done>
    - sendFeedback + sendClientEvent exported with sendBeacon + keepalive fallback.
    - 👍/👎 click in AssistantControls calls /api/feedback with FDBK-03 payload.
    - Citation chip click in ChatSurface calls /api/telemetry with event name `citation_click_through`.
    - Fallback "Flag a gap" click in FallbackCard calls /api/telemetry with event name `flag_a_gap_action`.
    - message_id correlation works between server and client (via new SSE event + body wiring).
    - Telemetry failures never break the UI.
  </done>
</task>

<task type="auto">
  <name>Task 3: Playwright E2E — full feedback + telemetry round trip</name>
  <files>
    tests/e2e/feedback-and-telemetry.spec.ts
  </files>
  <action>
    Create a new Playwright spec that exercises the full chain:
    1. Log in via the existing test auth helper (reuse the Phase 5.1 iron-session test fixture).
    2. Navigate to the chat page, select Consumer role, submit a canned question.
    3. Wait for the assistant message to complete (citation present, no fallback).
    4. Intercept `POST /api/feedback` via `page.route('**/api/feedback', ...)` — let it through but capture the request.
    5. Click the 👎 button, select "wrong citation" from the dropdown.
    6. Assert the intercepted request has:
       - Method POST
       - URL ends with `/api/feedback`
       - Body JSON contains `rating: 'down'`, `reason: 'wrong citation'`, a valid UUID `message_id`, and the correct `citation_source_id` / `citation_section_id` (from the assistant's chosen citation)
       - Request completes with 200 in < 5000 ms (timing assertion using `Date.now()` bookends).
    7. Intercept `POST /api/telemetry`, click the citation chip → assert a `citation_click_through` event is posted with matching source_id.
    8. Navigate to a question that produces a fallback (use a test fixture / canned query from Phase 2 fallback E2E). Click "Flag a gap" → assert a `flag_a_gap_action` event is posted.

    Timing budget: the entire test should complete in ~10s. Use `expect.poll` for the 5s SLA assertion.

    Add to existing `playwright.config.ts` test directory if needed (do not change the config otherwise — Phase 5.1 already has a working harness).
  </action>
  <verify>
    - `pnpm test:e2e tests/e2e/feedback-and-telemetry.spec.ts` passes.
    - `pnpm test:e2e` overall: 19 prior + 1 new spec (20/20), all green.
  </verify>
  <done>
    - End-to-end click-to-server latency asserted < 5000 ms per SC#4.
    - Payload shape matches FDBK-03 exactly.
    - Citation click + flag-a-gap events verified via intercepted requests.
    - Phase 5.1 E2E baseline remains green.
  </done>
</task>

</tasks>

<verification>
- Complete Phase 6 client-visible path works: role-select → chat → thumbs-down → server emits thumbs_rating with full payload → pino + OTel both see it.
- `curl -X POST http://localhost:3001/api/feedback` with no cookie → 401, no event emitted (manual check + unit test).
- `curl -X POST http://localhost:3001/api/feedback` with cookie + bad body → 400, no event.
- Playwright E2E confirms 5s SLA for the server-side round trip.
- All 597+ unit tests and 19+1 E2E tests green.
</verification>

<success_criteria>
Contributes to SC#1 (adds the client-emitted events: citation_click_through, thumbs_rating, flag_a_gap_action), SC#4 (thumbs-down server round-trip < 5s, payload shape exact). Requirement FDBK-03 is satisfied.

- [ ] /api/feedback + /api/telemetry exist and require auth
- [ ] Client helpers use sendBeacon with keepalive fallback (never block UI)
- [ ] 👍/👎 and citation-chip and flag-a-gap all emit the right events with the right dimensions
- [ ] Server-side thumbs round trip < 5 s under E2E
- [ ] All existing tests remain green
</success_criteria>

<output>
After completion, create `.planning/phases/06-telemetry-evals-and-pilot-hardening/06-03-SUMMARY.md`. Frontmatter: `subsystem: telemetry+ui`, `patterns.added: [sendBeacon+keepalive fallback, closed-enum /api/telemetry sink, message_id SSE echo]`, `decisions.made: [generate message_id server-side and SSE-echo for client correlation; reason dropdown gates sendFeedback call]`.
</output>

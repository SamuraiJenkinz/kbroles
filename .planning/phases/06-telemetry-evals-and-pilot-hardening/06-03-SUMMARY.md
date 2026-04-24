---
phase: 06-telemetry-evals-and-pilot-hardening
plan: "03"
subsystem: api
tags: [iron-session, zod, telemetry, sendBeacon, SSE, message_id, feedback, playwright, e2e]

# Dependency graph
requires:
  - phase: 06-01-telemetry-foundation
    provides: trackEvent() OTel+pino dual-emit choke point
  - phase: 06-02-question-hash-and-server-events
    provides: SESSION_CONTEXT typing + server-side event schema
  - phase: 05.1-bff-pivot
    provides: iron-session getSession() auth pattern + dev-permissive middleware

provides:
  - POST /api/feedback BFF endpoint (Zod validated, iron-session auth, trackEvent emission)
  - POST /api/telemetry BFF endpoint (closed-enum names, PII-key stripping, trackEvent emission)
  - sendFeedback() + sendClientEvent() browser helpers (sendBeacon + fetch keepalive fallback)
  - SSE message_id frame from /api/chat (first frame, server-generated UUID for client correlation)
  - UI wiring in AssistantControls (thumbs-up/down), ChatSurface (chip click), FallbackCard (flag a gap)
  - FDBK-03 payload shape: message_id, rating, reason, citation_source_id, citation_section_id
  - 3 Playwright E2E specs for SC#4 feedback + telemetry round trip

affects:
  - 06-07-workbook-and-alerts (can query thumbs_rating + citation_click_through + flag_a_gap_action events)
  - 06-08-steward-pull-and-docs (steward dashboard exercises feedback event schema)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - sendBeacon with fetch+keepalive fallback for fire-and-forget telemetry (never throws)
    - SSE message_id frame as first server write for client-server UUID correlation
    - Closed-enum Zod schema on telemetry endpoint (only known event names accepted)
    - PII_KEYS set stripping (email, upn, content, answer, quote, user) from telemetry dimensions
    - FeedbackDown.reason internal snake_case (wrong_citation) mapped to API space-separated (wrong citation) at call site
    - page.route() interception in Playwright for fire-and-forget endpoints that need real session cookies

key-files:
  created:
    - src/app/api/feedback/route.ts
    - src/app/api/feedback/__tests__/route.test.ts
    - src/app/api/telemetry/route.ts
    - src/app/api/telemetry/__tests__/route.test.ts
    - src/lib/telemetryClient.ts
    - src/lib/__tests__/telemetryClient.test.ts
    - tests-e2e/feedback-and-telemetry.spec.ts
  modified:
    - src/chat-ui/types.ts (SseEvent + Message + ChatAction extensions)
    - src/chat-ui/chatReducer.ts (assistant/message_id + assistant/question_hash cases)
    - src/chat/sse.ts (message_id SseEvent variant)
    - src/app/api/chat/route.ts (emit message_id SSE frame as first write)
    - src/app/api/chat/__tests__/route.test.ts (frame ordering + message_id assertion)
    - src/chat-ui/ChatSurface.tsx (message_id dispatch + handleChipClick with telemetry)
    - src/chat-ui/Message.tsx (onChipClick extended with message_id arg)
    - src/chat-ui/MessageList.tsx (onChipClick signature + question_hash passthrough)
    - src/chat-ui/AssistantControls.tsx (sendFeedback wiring for thumbs-up/down)
    - src/chat-ui/FallbackCard.tsx (sendClientEvent for flag_a_gap_action)
    - src/chat-ui/__tests__/AssistantControls.test.tsx (sendFeedback mock + 4 new tests)
    - src/chat-ui/__tests__/FallbackCard.test.tsx (sendClientEvent mock + 2 new tests)
    - src/chat-ui/__tests__/ChatSurface.test.tsx (sendClientEvent mock + 2 new tests)
    - src/chat-ui/__tests__/Message.test.tsx (onChipClick third-arg arity fix)
    - tests-e2e/keyboard-and-error-retry.spec.ts (Rule 1 strict-mode fix)

key-decisions:
  - "SSE Option B: server generates UUID, echoes as first SSE frame — client never generates its own message_id"
  - "message_id frame as standard JSON data frame (not named SSE event) for compatibility with existing regex reader"
  - "sendBeacon primary + fetch keepalive fallback pattern — fire-and-forget, never throws, no await at call site"
  - "page.route() interception for /api/feedback and /api/telemetry in E2E (real endpoints require sealed iron-session cookie)"
  - "Closed-enum event names on /api/telemetry — only citation_click_through and flag_a_gap_action accepted by Zod"
  - "PII_KEYS set strips email/upn/content/answer/quote/user from telemetry dimensions before trackEvent"
  - "FeedbackDown.reason uses wrong_citation (snake_case) internally; mapped to 'wrong citation' (space) at sendFeedback call site"

patterns-established:
  - "All client-side telemetry fire-and-forget: void sendFeedback() / void sendClientEvent() — never awaited at UI layer"
  - "message_id captured in chatReducer via assistant/message_id dispatch before any answer_delta renders"
  - "PII boundary enforced server-side on /api/telemetry — client dimensions pass through without redaction"

# Metrics
duration: 35min
completed: 2026-04-24
---

# Phase 6 Plan 03: Client Events and Feedback Endpoint Summary

**POST /api/feedback + POST /api/telemetry BFF endpoints with iron-session auth + sendBeacon browser helpers + SSE message_id UUID correlation + full FDBK-03 payload wired across AssistantControls/ChatSurface/FallbackCard**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-24T09:45:00Z
- **Completed:** 2026-04-24T10:20:00Z
- **Tasks:** 3 (BFF endpoints, telemetryClient + UI wiring, Playwright E2E)
- **Files modified:** 22

## Accomplishments

- Two production BFF endpoints (`/api/feedback`, `/api/telemetry`) with iron-session auth guard, Zod validation, and `trackEvent()` emission — 13 unit tests covering 401 auth, 400 validation, 200 happy paths, PII stripping, and closed-enum enforcement
- `sendFeedback()` + `sendClientEvent()` browser helpers using `navigator.sendBeacon` with `fetch + keepalive` fallback (fire-and-forget, swallows errors) — 8 unit tests in jsdom; UI wired into AssistantControls (thumbs-up/down + reason), ChatSurface (chip click → `citation_click_through`), FallbackCard (flag a gap → `flag_a_gap_action`)
- `/api/chat` emits `message_id` as first SSE frame; `chatReducer` captures it before any `answer_delta` so the client UUID always matches the server's correlation ID; 3 Playwright E2E specs confirm the full SC#4 round trip including timing SLA (< 5000 ms)

## Task Commits

1. **Task 1: BFF endpoints** - `264944a` (feat)
2. **Task 2: telemetryClient + UI wiring + message_id SSE echo** - `325834e` (feat)
3. **Task 3: Playwright E2E feedback round-trip** - `b48f12e` (test)

## Files Created/Modified

**Created:**
- `src/app/api/feedback/route.ts` — POST endpoint: iron-session auth, Zod FeedbackSchema, trackEvent('thumbs_rating', ...)
- `src/app/api/feedback/__tests__/route.test.ts` — 7 unit tests (401/400/200 variants)
- `src/app/api/telemetry/route.ts` — POST endpoint: iron-session auth, closed-enum Zod schema, PII stripping, trackEvent
- `src/app/api/telemetry/__tests__/route.test.ts` — 6 unit tests (401/400/200 + PII stripping)
- `src/lib/telemetryClient.ts` — sendFeedback() + sendClientEvent() browser helpers with sendBeacon/fetch fallback
- `src/lib/__tests__/telemetryClient.test.ts` — 8 unit tests (jsdom: sendBeacon path, fetch fallback, error swallowing)
- `tests-e2e/feedback-and-telemetry.spec.ts` — 3 Playwright E2E specs for SC#4 + FDBK-03

**Modified (key):**
- `src/app/api/chat/route.ts` — emits `{ type: 'message_id', id: UUID }` as first SSE frame
- `src/chat-ui/AssistantControls.tsx` — calls sendFeedback() on thumbs-up and thumbs-down+reason
- `src/chat-ui/ChatSurface.tsx` — dispatches assistant/message_id; calls sendClientEvent('citation_click_through') on chip click
- `src/chat-ui/FallbackCard.tsx` — calls sendClientEvent('flag_a_gap_action') on flag a gap click
- `src/chat-ui/types.ts` — SseEvent + Message + ChatAction extensions for message_id/question_hash

## Decisions Made

- **SSE Option B (server-generated UUID)**: Server assigns `message_id` before streamAnswer, emits as first SSE data frame. Rejected Option A (client sends UUID in POST body) because it requires the client to generate and trust its own IDs.
- **Standard JSON data frame for message_id**: Used `data: {...}\n\n` (not named `event: message_id\n`) to stay compatible with existing SSE reader regex `frame.match(/^data: (.*)$/s)`.
- **sendBeacon primary + fetch keepalive fallback**: sendBeacon returns false when payload > 64 KB or browser blocks it; fallback ensures delivery. Both paths fire-and-forget (no await at UI layer).
- **page.route() interception in E2E**: `/api/feedback` and `/api/telemetry` require a real sealed iron-session cookie; dev-permissive middleware only covers `/api/chat`. Mocking exercises the client-side logic (payload construction, timing SLA) without real session infrastructure.
- **Closed-enum telemetry event names**: Only `citation_click_through` and `flag_a_gap_action` accepted by Zod — prevents arbitrary event name injection from client.
- **PII_KEYS server-side stripping**: `email`, `upn`, `content`, `answer`, `quote`, `user` stripped from `dimensions` before trackEvent; pino warns on each stripped key.
- **FeedbackDown reason mapping**: Internal Redux convention `wrong_citation` (snake_case) mapped to API wire format `'wrong citation'` (space) at the sendFeedback call site in AssistantControls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Message.test.tsx onChipClick arity mismatch**
- **Found during:** Task 2 (telemetryClient + UI wiring)
- **Issue:** Pre-existing test `toHaveBeenCalledWith('KB0020882', 'resolution-field-software')` broke because the extended onChipClick signature now passes `undefined` as a third arg (message_id)
- **Fix:** Updated assertion to `toHaveBeenCalledWith('KB0020882', 'resolution-field-software', undefined)`
- **Files modified:** `src/chat-ui/__tests__/Message.test.tsx`
- **Verification:** Full unit test suite 716/716 green
- **Committed in:** 325834e (Task 2 commit)

**2. [Rule 1 - Bug] AssistantControls reason mapping mismatch**
- **Found during:** Task 2 (telemetryClient + UI wiring)
- **Issue:** Test expected `reason: 'wrong citation'` (API wire format with space) but FeedbackDown uses `wrong_citation` (snake_case Redux convention). Test would fail without the mapping.
- **Fix:** Added mapping in handleReason: `const apiReason = (reason === 'wrong_citation' ? 'wrong citation' : reason) as 'hallucinated' | 'wrong citation' | 'incomplete' | 'other'`
- **Files modified:** `src/chat-ui/AssistantControls.tsx`
- **Verification:** 4 new AssistantControls sendFeedback tests pass
- **Committed in:** 325834e (Task 2 commit)

**3. [Rule 1 - Bug] route.test.ts frame ordering assertion broke after message_id SSE addition**
- **Found during:** Task 2 (message_id SSE echo in /api/chat)
- **Issue:** Happy-path test expected exactly `['answer_delta', 'citations', 'done']` but adding the message_id frame changed it to `['message_id', 'answer_delta', 'citations', 'done']`; frame index references also shifted
- **Fix:** Added `{ type: 'message_id'; id: string }` to SseFrame union, updated `toEqual` assertion, updated frame index references (frames[0]→message_id UUID, frames[1]→answer, frames[3]→done)
- **Files modified:** `src/app/api/chat/__tests__/route.test.ts`
- **Verification:** All route tests pass (part of 716/716 unit baseline)
- **Committed in:** 325834e (Task 2 commit)

**4. [Rule 1 - Bug] keyboard-and-error-retry.spec.ts strict-mode violation in parallel E2E run**
- **Found during:** Task 3 (E2E verification)
- **Issue:** `page.getByText(/flag an article/i)` strict mode violation when both `feedback-and-telemetry.spec.ts` and `keyboard-and-error-retry.spec.ts` run in parallel — KB0022991 source panel loads real content ("Any user with read access can flag an article") alongside the answer bubble ("You can flag an article..."), causing 2 matches
- **Fix:** Added `.first()` to both `getByText(/flag an article/i)` assertions in keyboard spec (lines 46 and 85); the answer bubble is always the first match
- **Files modified:** `tests-e2e/keyboard-and-error-retry.spec.ts`
- **Verification:** Full E2E suite 22/22 passed, 2 skipped (remote-smoke)
- **Committed in:** b48f12e (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (3 Rule 1 bugs, 1 Rule 1 test isolation bug)
**Impact on plan:** All auto-fixes were necessary for correctness. No scope creep. The SSE message_id frame addition was the planned work that triggered the test updates.

## Issues Encountered

- The `message_id` SSE frame being emitted as a standard `data: {...}` JSON frame (not a named SSE event) is correct for compatibility with the existing regex reader but requires care: the frame's `type` field (`'message_id'`) is what distinguishes it, not an SSE `event:` header.
- `accidental staging` note: the `docs/ops/eval-gate-bypass-procedure.md` file from the concurrent 06-06 agent was picked up in the Task 1 commit (264944a) because it was already present in the working tree when staged. Content is correct; this is noted for audit purposes only.

## User Setup Required

None — no external service configuration required for this plan. The `/api/feedback` and `/api/telemetry` endpoints are automatically available once deployed; they use the same iron-session cookie as `/api/chat`.

## Next Phase Readiness

- `thumbs_rating`, `citation_click_through`, and `flag_a_gap_action` events now flowing to `trackEvent()` — ready for App Insights workbook queries in Phase 6 Plan 07
- `message_id` correlation established end-to-end: server UUID → SSE frame → chatReducer → sendFeedback/sendClientEvent payload → trackEvent dimension
- Test baseline: 716/716 unit + 22/22 E2E (2 skipped remote-smoke)
- No blockers for Phase 6 Plans 07 and 08

---
*Phase: 06-telemetry-evals-and-pilot-hardening*
*Completed: 2026-04-24*

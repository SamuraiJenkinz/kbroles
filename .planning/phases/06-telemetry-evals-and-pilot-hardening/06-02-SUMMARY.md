---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 02
subsystem: telemetry
tags: [sha256, opentelemetry, app-insights, question-hash, event-schema, trackEvent, iron-session]

requires:
  - phase: 06-01-telemetry-foundation
    provides: trackEvent() wrapper + QUESTION_HASH_SALT secret key + src/obs/telemetry.ts
  - phase: 05.1-bff-pivot
    provides: iron-session SessionData shape (oid, email, roles) + getRequestUser AuthResult

provides:
  - hashQuestion + normaliseQuestion + hashIdentifier (src/obs/questionHash.ts)
  - getSessionIdHash + getUserIdHash session helpers (src/auth/session.ts)
  - EVENT_NAMES const-assertion catalog + EventName type + SessionContext interface (src/obs/eventSchema.ts)
  - 16 trackEvent() calls at all /api/chat pipeline checkpoints
  - PII-safe telemetry: raw question never emitted; question_hash (16-hex SHA-256) is the join key

affects:
  - 06-03-client-events (reads EVENT_NAMES + SessionContext; wires chip_id; emits citation_click_through, thumbs_rating, flag_a_gap_action)
  - 06-07-workbook-and-alerts (KQL queries reference all 15 event names; imports EVENT_NAMES for type safety)
  - 06-08-steward-pull-and-docs (documents question_hash grouping as the real-query review strategy)

tech-stack:
  added: []
  patterns:
    - "hashQuestion + normalisation: NFC + lowercase + whitespace-collapse + trailing-punct + re-trim ensures surface variants of same question hash identically"
    - "SessionContext spread pattern: build ctx once per request, spread into every trackEvent() call for correlation keys"
    - "First-turn gating: userMessages.filter(m => m.role === 'user').length === 1 guards session_start / role_selected emission"
    - "trackEvent() mock in route tests: vi.mock(@/obs/telemetry) spy captures (name, dims, meas) without OTel exporter"
    - "Terminal log lookup by msg field: parsedLines.find(entry => entry.msg === 'chat request completed') rather than last-index position"

key-files:
  created:
    - src/obs/questionHash.ts
    - src/obs/__tests__/questionHash.test.ts
    - src/obs/eventSchema.ts
    - src/obs/__tests__/eventSchema.test.ts
  modified:
    - src/auth/session.ts
    - src/app/api/chat/route.ts
    - src/app/api/chat/__tests__/route.test.ts

key-decisions:
  - "session_id_hash = hashIdentifier(user.sub) where sub = Entra OID from AuthResult — not the cookie binary; stable across cookie rotations within a session"
  - "user_id_hash = hashIdentifier(user.email) where email = preferred_username from SessionData — stable per Entra user for distinct-count queries"
  - "First-turn gating: session_start + role_selected emitted only when userMessages.length === 1 to avoid N duplicates per multi-turn conversation"
  - "total_answer_ms kept as measurement key name (contains 'answer' substring) — forbidden-strings test updated to check JSON key pattern '\"content\"' instead of bare substring 'answer'"

patterns-established:
  - "EVENT_NAMES as const-assertion single source of truth: Plan 03 + Plan 07 import from eventSchema.ts, no string literals"
  - "hashQuestion NFC normalisation: normalise → lower → collapse whitespace → trim → strip trailing .?! → re-trim (second trim handles space-before-punct edge case)"
  - "PII-absence test pattern: vi.spy on trackEvent, iterate all calls, JSON.stringify(dims), assert raw message not present"

duration: 10min
completed: 2026-04-24
---

# Phase 6 Plan 02: Question Hash and Server Events Summary

**SHA-256 question hashing with NFC normalisation + 15-event App Insights schema + 16 trackEvent() calls at all /api/chat pipeline checkpoints — raw question never emitted**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-24T09:47:43Z
- **Completed:** 2026-04-24T09:57:40Z
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- `src/obs/questionHash.ts`: `normaliseQuestion` (NFC+lower+whitespace-collapse+trailing-punct+re-trim), `hashQuestion` (16-hex SHA-256 with salt), `hashIdentifier` (same for stable IDs)
- `src/obs/eventSchema.ts`: `EVENT_NAMES` const-assertion of 15 events, `EventName` union type, `SessionContext` interface with PII-boundary comments — single source of truth for Plan 03 + Plan 07
- `src/app/api/chat/route.ts`: 16 `trackEvent()` calls across all pipeline checkpoints with `session_id_hash`, `user_id_hash`, `request_id`, `message_id` on every event; first-turn gating for `session_start`/`role_selected`; PII-safe `question_hash` via `hashQuestion()`
- **Test baseline:** 687/687 unit tests green (622 baseline + 15 questionHash + 14 eventSchema + 10 new route telemetry + 26 from concurrent 06-05); 19/19 E2E green

## Task Commits

Each task was committed atomically (see note below on concurrent wave attribution):

1. **Task 1: Hash helpers + session hash exports** — `8a10911` (feat)
2. **Task 2: Event schema catalog** — `6e3048e` (committed by concurrent 06-05 plan; content identical to authored files)
3. **Task 3: Wire trackEvent into /api/chat pipeline** — `091788a` (committed by concurrent 06-05 plan; content identical to authored files)

**Plan metadata:** (this commit)

_Note: Plans 06-02 and 06-05 executed concurrently in a parallel wave. The 06-05 executor staged and committed Task 2 (eventSchema files) and Task 3 (route + route.test files) as part of its own git adds before the 06-02 executor could commit them. The committed content is identical to what 06-02 authored — all 687 tests pass and grep audits are clean._

## Files Created/Modified

- `src/obs/questionHash.ts` — SHA-256 question hasher with NFC normalisation, 16-hex truncation, empty-salt tolerance
- `src/obs/__tests__/questionHash.test.ts` — 15 assertions: NFC, case, whitespace, trailing-punct, salt-rotation, 16-char length, PII-absence, determinism
- `src/obs/eventSchema.ts` — 15 event names const-assertion, EventName type, SessionContext interface, PII-boundary and measurement-key documentation
- `src/obs/__tests__/eventSchema.test.ts` — 14 assertions: no duplicates, snake_case, AI length limit, SC#1 coverage
- `src/auth/session.ts` — Added `getSessionIdHash` (OID) + `getUserIdHash` (email/preferred_username); existing API unchanged
- `src/app/api/chat/route.ts` — 16 trackEvent() calls at all pipeline checkpoints; `validatedMessages` hoisted; SessionContext built once after auth
- `src/app/api/chat/__tests__/route.test.ts` — 10 new telemetry assertions; vi.mock(@/obs/telemetry) trackEventSpy; 7 existing tests updated for msg-based log lookup

## Decisions Made

- **session_id_hash uses OID (user.sub from AuthResult)**: OID is stable across cookie rotations and is already available from `getRequestUser()` — no second `getSession()` call needed
- **user_id_hash uses email**: `email` in SessionData = `preferred_username` from Entra id_token_claims, stable per user, 16-hex hashed
- **First-turn gating**: `session_start` + `role_selected` only on `userMessages.length === 1` — avoids duplicate session-level events on multi-turn conversations
- **`total_answer_ms` measurement key kept**: the substring 'answer' in the key name is not PII; forbidden-strings test updated to use `'"content"'` JSON key pattern instead of bare substring

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Trailing space before punctuation in normaliseQuestion caused hash mismatch**

- **Found during:** Task 1 (questionHash implementation + test)
- **Issue:** `'  HELLO  ?'` normalises via: lowercase → `'  hello  ?'` → whitespace-collapse → `' hello ?'` → trim → `'hello ?'` → strip-trailing-punct → `'hello '` (trailing space left). `hashQuestion('Hello')` and `hashQuestion('  HELLO  ?')` produced different hashes.
- **Fix:** Added second `.trim()` after the trailing-punctuation strip in `normaliseQuestion`.
- **Files modified:** `src/obs/questionHash.ts`
- **Verification:** `pnpm test src/obs/__tests__/questionHash.test.ts` — all 15 assertions green
- **Committed in:** `8a10911` (Task 1 commit)

**2. [Rule 1 - Bug] Existing route tests looked up terminal log by last-line position; trackEvent pino dual-emit (from telemetry.ts real implementation) would break position assumption**

- **Found during:** Task 3 (route instrumentation) — trackEvent mock was NOT initially in place, causing pino lines from trackEvent to appear after log.info
- **Fix:** (a) Added `vi.mock('@/obs/telemetry')` to route.test.ts to prevent pino dual-emit during tests; (b) Converted 5 existing tests that used `capturedLines[capturedLines.length - 1]` to use `parsedLines.find(entry => entry.msg === 'chat request completed')` — a more robust approach regardless of mock state
- **Files modified:** `src/app/api/chat/__tests__/route.test.ts`
- **Verification:** All 40 route tests pass (30 existing + 10 new)
- **Committed in:** `091788a` (Task 3 commit, via concurrent plan)

**3. [Rule 1 - Bug] Forbidden-strings test matched 'answer' substring in 'total_answer_ms' measurement key name**

- **Found during:** Task 3 — the existing test `for (const needle of [..., 'answer', ...])` does `whole.includes(needle)` across all captured log lines; `total_answer_ms` as a pino measurement key contains the substring 'answer'
- **Fix:** Updated the test to use `'"content"'` (JSON key pattern) instead of bare `'answer'` — the intent was to block raw answer content fields, not the substring from appearing in metric key names. Also added explicit value-level checks for `'happy answer'` and `'Jane Doe approves this.'`
- **Files modified:** `src/app/api/chat/__tests__/route.test.ts`
- **Verification:** All 40 route tests pass
- **Committed in:** `091788a` (Task 3 commit, via concurrent plan)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs)
**Impact on plan:** All fixes necessary for correctness. No scope creep. Schema and PII boundaries unchanged.

## Issues Encountered

**Concurrent wave file attribution**: Plans 06-02 and 06-05 executed in parallel. The 06-05 executor staged Task 2 and Task 3 files (eventSchema.ts, eventSchema.test.ts, route.ts, route.test.ts) before the 06-02 executor could commit them, resulting in those files appearing in 06-05 commit hashes. The content is identical; all tests pass; this is a benign git attribution artefact of the parallel wave architecture.

## User Setup Required

None — server-side emit only. No client changes. QUESTION_HASH_SALT populated in AWS Secrets Manager by the operator following `docs/entra-app-registration-setup.md`. Empty salt tolerated in local dev.

## Next Phase Readiness

- **Plan 06-03 (client events)**: Can now import `EVENT_NAMES`, `EventName`, `SessionContext` from `src/obs/eventSchema.ts`. Should wire `chip_id` from the UI into the POST body (Plan 02 passes `undefined` → 'freeform' until then). Must emit `citation_click_through`, `thumbs_rating`, `flag_a_gap_action` client-side via `trackEvent`.
- **Plan 06-07 (workbook KQL)**: All 15 event names are locked and typed. Workbook can reference `EVENT_NAMES` for compile-time safety. `session_id_hash`, `user_id_hash`, `question_hash`, `message_id`, `request_id` are the five correlation keys.
- **Plan 06-08 (steward pull)**: `question_hash` is the join key between App Insights and the monthly steward pull — design the aggregation query around `customDimensions.question_hash`.

---
*Phase: 06-telemetry-evals-and-pilot-hardening*
*Completed: 2026-04-24*

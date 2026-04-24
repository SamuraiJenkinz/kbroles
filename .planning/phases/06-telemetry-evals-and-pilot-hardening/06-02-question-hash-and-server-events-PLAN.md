---
phase: 06-telemetry-evals-and-pilot-hardening
plan: 02
type: execute
wave: 2
depends_on:
  - 06-01-telemetry-foundation-PLAN.md
files_modified:
  - src/obs/questionHash.ts
  - src/obs/__tests__/questionHash.test.ts
  - src/obs/eventSchema.ts
  - src/obs/__tests__/eventSchema.test.ts
  - src/app/api/chat/route.ts
  - src/app/api/chat/__tests__/route.test.ts
  - src/auth/session.ts
autonomous: true
blocks_execution_on:
  - "Plan 06-01 must be merged so trackEvent() and QUESTION_HASH_SALT secret loader exist"
  - "Operator must populate QUESTION_HASH_SALT in AWS Secrets Manager (blank tolerated in local dev; plan fails-soft with hash-with-empty-salt warning logged once)"

must_haves:
  truths:
    - "Raw question text is never emitted to App Insights or pino logs"
    - "The same question (case/whitespace variants) hashes identically for gap detection"
    - "Every /api/chat request emits chat_request_started, session_start (first turn), role_selected (first turn), chip_vs_freeform, question_hash, and a terminal chat_request_completed event OR a fallback_trigger event"
    - "Each event carries session_id_hash, user_id_hash, request_id, message_id for cross-event correlation"
    - "validator_flip and allowlist_block events fire whenever the Phase 2 validator strips citations or the entity allowlist rejects an answer"
    - "ingress_error event fires on upstream LLM / MGTI ingress failures with error_code dimension"
    - "Existing Phase 2 chat route tests + Phase 1-5.1 tests all remain green"
  artifacts:
    - path: "src/obs/questionHash.ts"
      provides: "SHA-256 question hasher with normalisation + salt"
      exports: ["hashQuestion", "normaliseQuestion"]
    - path: "src/obs/eventSchema.ts"
      provides: "Type-safe event catalog + dimension/measurement types"
      exports: ["EventName", "EVENT_NAMES", "SessionContext"]
    - path: "src/obs/__tests__/questionHash.test.ts"
      provides: "Hash stability, normalisation, salt effect, PII-absence assertions"
    - path: "src/app/api/chat/route.ts"
      provides: "Emits the server-side event stream from the chat pipeline"
      contains: "trackEvent"
  key_links:
    - from: "src/app/api/chat/route.ts"
      to: "src/obs/telemetry.ts"
      via: "trackEvent() calls at pipeline checkpoints"
      pattern: "trackEvent\\("
    - from: "src/app/api/chat/route.ts"
      to: "src/obs/questionHash.ts"
      via: "hashQuestion(lastUserMessage) before emitting question_hash"
      pattern: "hashQuestion\\("
    - from: "src/auth/session.ts"
      to: "SHA-256 of sid/UPN + salt"
      via: "exported helper reading QUESTION_HASH_SALT"
      pattern: "hashSession|hashUser|createHash"
---

<objective>
Introduce question hashing, session/user hashing, and emit all server-side business events from the Phase 2 chat pipeline. After this plan, an App Insights workbook can count sessions, roles, chip-vs-freeform ratios, validator flips, allowlist blocks, fallback triggers, and ingress errors — and a session has a stable `question_hash` grouping without ever persisting raw query text.

Purpose: Satisfies TELE-01 (pre-registered schema), TELE-02 (anonymised logging — no raw question text), and the server half of TELE-03. Addresses ROADMAP Pitfall 15 (real-query review) by making question-hash the join key between App Insights and the steward's monthly pull.

Output: Hash helpers in `src/obs/`, a typed event schema that Plan 03 and Plan 07 (workbook) share, and the `/api/chat` route handler emitting the locked event stream at every pipeline checkpoint.
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
@src/app/api/chat/route.ts
@src/auth/session.ts
@src/obs/logger.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement hashQuestion + session/user hash helpers with unit tests</name>
  <files>
    src/obs/questionHash.ts
    src/obs/__tests__/questionHash.test.ts
    src/auth/session.ts
  </files>
  <action>
    1. Create `src/obs/questionHash.ts` exactly per RESEARCH.md §Pattern 3:
       ```typescript
       import { createHash } from 'node:crypto'

       const SALT_ENV = 'QUESTION_HASH_SALT'

       /** NFC normalise, lowercase, collapse whitespace, trim, strip trailing .?! */
       export function normaliseQuestion(raw: string): string {
         return raw
           .normalize('NFC')
           .toLowerCase()
           .replace(/\s+/g, ' ')
           .trim()
           .replace(/[.?!]+$/, '')
       }

       /** Returns 16-hex-char (64-bit) prefix of SHA-256(salt + normalised) */
       export function hashQuestion(raw: string): string {
         const salt = process.env[SALT_ENV] ?? ''
         return createHash('sha256').update(salt + normaliseQuestion(raw)).digest('hex').slice(0, 16)
       }

       /** Hash an iron-session sid or similar stable identifier. Same salt. 16 chars. */
       export function hashIdentifier(raw: string): string {
         const salt = process.env[SALT_ENV] ?? ''
         return createHash('sha256').update(salt + raw).digest('hex').slice(0, 16)
       }
       ```
       Do NOT use Web Crypto `subtle.digest` — it is async and this function is called on a hot path.

    2. Extend `src/auth/session.ts`: add two exports (keep all existing exports intact):
       - `getSessionIdHash(session)` → `hashIdentifier(session.user.sub + session.user.oid)` — uses the stable Entra `sub`+`oid` from id_token_claims rather than the cookie binary so the hash survives cookie rotation within a session.
       - `getUserIdHash(session)` → `hashIdentifier(session.user.upn ?? session.user.preferred_username)` — stable per-user distinct counting.
       Both must accept the existing SessionData shape and return `string` or `undefined` if the session is unauthenticated. Do NOT change the SessionOptions / getIronSession wiring.

    3. Create `src/obs/__tests__/questionHash.test.ts` with Vitest tests:
       - normaliseQuestion: `'How do I RESET my PASSWORD?'` → `'how do i reset my password'`, `'   leading/trailing   '` → `'leading/trailing'`, unicode NFC: `'café'` (composed) equals `'café'` (decomposed).
       - hashQuestion: `hashQuestion('Hello')` === `hashQuestion('hello.')` === `hashQuestion('  HELLO  ?')` (all normalise identically).
       - hashQuestion: `hashQuestion('A')` !== `hashQuestion('B')`.
       - Salt effect: set `process.env.QUESTION_HASH_SALT = 'alpha'` → hash X; change to `'beta'` → hash Y; assert X !== Y. Restore env after test.
       - Hash length is exactly 16 hex chars (64-bit prefix).
       - PII absence: assert `hashQuestion('my email is tay@example.com')` does not contain `'tay'`, `'example'`, or `'@'` anywhere in the hex string.
       - hashIdentifier is deterministic for same input and salt.
       Use `vi.stubEnv` or `beforeEach`/`afterEach` to manage QUESTION_HASH_SALT in tests; never leak it across test files.
  </action>
  <verify>
    - `pnpm test src/obs/__tests__/questionHash.test.ts` passes with ≥7 assertions.
    - `pnpm test` overall: 597 prior + new hash tests, all green.
    - `pnpm typecheck` clean.
    - Grep: `grep -r "subtle.digest" src/obs` returns nothing (enforces Node crypto path).
  </verify>
  <done>
    - `hashQuestion`, `normaliseQuestion`, `hashIdentifier` exported from `src/obs/questionHash.ts`.
    - `getSessionIdHash` and `getUserIdHash` exported from `src/auth/session.ts` (additive; existing API unchanged).
    - Normalisation handles NFC, case, whitespace collapse, trailing punctuation.
    - Salt rotation changes the hash; missing salt hashes with empty string (no throw, logged once at startup is NOT required — caller uses empty salt during local dev).
    - 64-bit truncation is applied uniformly.
  </done>
</task>

<task type="auto">
  <name>Task 2: Define EventSchema catalog + type-safe dimension helpers</name>
  <files>
    src/obs/eventSchema.ts
    src/obs/__tests__/eventSchema.test.ts
  </files>
  <action>
    1. Create `src/obs/eventSchema.ts` with:
       - A const-assertion array of event names Plan 02 and Plan 03 emit:
         ```typescript
         export const EVENT_NAMES = [
           'session_start',
           'role_selected',
           'chip_vs_freeform',
           'question_hash',
           'citation_returned',
           'citation_click_through',
           'thumbs_rating',
           'fallback_trigger',
           'flag_a_gap_action',
           'chat_request_started',
           'chat_request_completed',
           'validator_flip',
           'allowlist_block',
           'ingress_error',
           'eval_run_completed',
         ] as const
         export type EventName = (typeof EVENT_NAMES)[number]
         ```
       - A `SessionContext` type that every emit point builds once per request:
         ```typescript
         export interface SessionContext {
           session_id_hash: string | undefined  // undefined = unauthenticated (e.g. health probe)
           user_id_hash: string | undefined
           request_id: string
           role: 'consumer' | 'author' | undefined
         }
         ```
       - Document in a top-of-file comment that dimension VALUES in App Insights are strings; numeric quantities go in measurements. Enumerate the measurement keys: `first_token_ms`, `total_answer_ms`, `citations_count`, `validator_flips`, `retries`, `chunk_count`.
       - Document PII boundaries (copy from CONTEXT.md §PII boundaries): NEVER emit raw question, raw answer, citation quotes, email, UPN, display name, cookie, tenantId.

    2. Create `src/obs/__tests__/eventSchema.test.ts` with trivial but meaningful tests:
       - `EVENT_NAMES` contains every name from Phase 6 CONTEXT.md (snake_case, no duplicates).
       - Every `EventName` is a valid App Insights customEvent name (snake_case, alphanumeric + underscore only, max length 512 per AI constraints).
       - The catalog satisfies the roadmap SC#1 list: `session_start`, `role_selected`, `chip_vs_freeform`, `question_hash`, `citation_returned`, `citation_click_through`, `thumbs_rating`, `fallback_trigger`, `flag_a_gap_action` are all present.
  </action>
  <verify>
    - `pnpm test src/obs/__tests__/eventSchema.test.ts` passes.
    - `pnpm typecheck` passes and `EventName` narrows correctly at call sites (test a bad name to confirm ts-expect-error would fire — comment-only proof).
  </verify>
  <done>
    - `src/obs/eventSchema.ts` is the single source of truth for event names.
    - Plan 03 (client events) and Plan 07 (workbook KQL) both read this file; no string literals.
    - Tests assert the catalog stays aligned with ROADMAP SC#1.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire trackEvent() into /api/chat pipeline at every checkpoint</name>
  <files>
    src/app/api/chat/route.ts
    src/app/api/chat/__tests__/route.test.ts
  </files>
  <action>
    Modify `src/app/api/chat/route.ts` to emit events at the locked pipeline checkpoints documented in the file header. The existing pino logging is NOT replaced — it stays. Add trackEvent() calls alongside, each passing `session_id_hash`, `user_id_hash`, `request_id`, and `role` (from SessionContext), plus per-event dimensions/measurements. Pitfall focus: P3 (multi-turn positional) — the `chip_vs_freeform` and `question_hash` events are the observable signal for future positional analysis.

    Concretely:

    1. At the top of the handler (after request_id + requestLogger are created, after session is read via getIronSession):
       - Build `ctx: SessionContext = { session_id_hash: getSessionIdHash(session), user_id_hash: getUserIdHash(session), request_id, role }`.
       - Emit `trackEvent('chat_request_started', { ...ctx, message_id: crypto.randomUUID() })` — hold that message_id on a local variable; it is the correlation key Plan 03's thumbs_rating will reference.

    2. First-turn detection — the request body has `messages: ChatMessage[]`. If `messages.filter(m => m.role === 'user').length === 1` (first user turn), emit:
       - `trackEvent('session_start', { ...ctx })`
       - `trackEvent('role_selected', { ...ctx, role })` (role is already required in SessionContext; repeat explicitly for the workbook join)
       First-turn-only to avoid N duplicate events per conversation. Later turns get only `chat_request_started` + the per-message events below.

    3. On every request: determine `chip_or_freeform` — if the request body carries a `chip_id` field (client surfaces this when the user tapped a suggested prompt chip), emit:
       - `trackEvent('chip_vs_freeform', { ...ctx, chip_or_freeform: chip_id ? 'chip' : 'freeform', chip_id: chip_id ?? undefined })`.
       If the client does not yet send `chip_id`, pass undefined and log "Plan 03 wires this dimension from the client."

    4. Before streaming starts, emit `question_hash`:
       - Take `lastUserMessage.content` from the messages array.
       - `trackEvent('question_hash', { ...ctx, message_id, question_hash: hashQuestion(lastUserMessage.content) })`
       - The raw content is NEVER emitted. Add a unit test that grep-asserts the emitted dimensions do not contain the raw question.

    5. Inside the streaming IIFE where the Phase 2 pipeline classifies the response:
       - On `can_answer === false` OR all citations stripped OR allowlist violation: `trackEvent('fallback_trigger', { ...ctx, message_id, reason: /* 'can_answer_false' | 'all_citations_stripped' | 'allowlist_violation' */ })`.
       - When the validator strips at least one citation but not all: `trackEvent('validator_flip', { ...ctx, message_id }, { validator_flips: strippedCount })`.
       - On allowlist block (can be independent of validator_flip): `trackEvent('allowlist_block', { ...ctx, message_id, violating_class: /* 'kb_number' | 'approver' | 'url' */ })`.
       - On happy-path completion: `trackEvent('citation_returned', { ...ctx, message_id, source_id: citation.source_id, section_id: citation.section_id })`.

    6. In the outer catch (or the IIFE catch — choose whichever is the sole terminal point), emit `ingress_error` when the error is classified as an LLM/ingress error (use the existing `src/llm/errors.ts` typed errors):
       - `trackEvent('ingress_error', { ...ctx, message_id, error_code: err.code })`.

    7. At the terminal log.info already emitted today, ALSO emit `chat_request_completed` with measurements:
       - `trackEvent('chat_request_completed', { ...ctx, message_id }, { first_token_ms, total_answer_ms, citations_count, validator_flips, retries, chunk_count })`.
       Where `retries` = the `retries` field already present in Phase 2's terminal log; `chunk_count` = streamed token chunk count already tracked.

    CRITICAL: do not await trackEvent() — it is synchronous. Do not wrap any of these in try/catch that swallows emit failures — OTel exporters queue internally and handle their own errors.

    Expand `src/app/api/chat/__tests__/route.test.ts` to cover:
    - An authenticated happy-path request emits chat_request_started, question_hash (with a valid 16-hex-char hash), citation_returned, and chat_request_completed in that order (assert via a `vi.mock('@/src/obs/telemetry')` spy).
    - A first-turn request additionally emits session_start and role_selected.
    - A second-turn request does NOT emit session_start or role_selected.
    - A request where the validator strips all citations emits fallback_trigger with `reason: 'all_citations_stripped'`.
    - A request with a `chip_id` body field emits chip_vs_freeform with `chip_or_freeform: 'chip'`; without it, emits 'freeform'.
    - None of the emitted dimension maps contain the raw user message string (PII test — iterate over all calls to the trackEvent spy and grep for the raw input).
    - A request that hits an MGTI 503 via mocked src/llm/errors.ts emits ingress_error with the matching error_code.
    - Emit ordering does not depend on pino's scrubber — the PII-absence test runs against the spy's arguments, not pino output.
  </action>
  <verify>
    - `pnpm test src/app/api/chat/__tests__/route.test.ts` passes ALL existing and new assertions.
    - `pnpm test` overall: 597 prior + new telemetry assertions, all green.
    - Manual: `pnpm dev`, POST to /api/chat with a cookie, check pino output shows the event stream (dual-emit), check Live Metrics (if operator has provided the connection string).
    - Grep: `grep -n "trackEvent" src/app/api/chat/route.ts` returns at least 8 calls (started + session_start/role_selected gated + chip_vs_freeform + question_hash + citation_returned or fallback_trigger + validator_flip or allowlist_block + completed + possibly ingress_error).
    - 19/19 Phase 5.1 Playwright E2E tests remain green (the client hasn't changed; server added emit side-effects only).
  </verify>
  <done>
    - Every checkpoint in the Phase 2 chat pipeline has a matching trackEvent.
    - `session_id_hash`, `user_id_hash`, `request_id`, `message_id` are the four correlation keys on every event.
    - Raw question, raw answer, citation quote, UPN, email never appear in any emitted attribute.
    - Tests assert event ordering, gating (first-turn only), and PII absence.
    - Phase 1-5.1 test baseline remains 100% green.
  </done>
</task>

</tasks>

<verification>
- Integration smoke: `pnpm dev`, POST a request to /api/chat with a valid iron-session cookie. Observe the pino dual-emit stream. If APPLICATIONINSIGHTS_CONNECTION_STRING is set, observe events within 2-5 minutes in the AI portal's `customEvents` table (KQL: `customEvents | where timestamp > ago(10m) | project timestamp, name, customDimensions`).
- Grep audit for PII regression: `grep -nE "logger\\.(info|warn|error)\\(.*content\\b|trackEvent\\(.*messages\\b" src/app/api/chat/route.ts` returns nothing.
- Grep audit for raw question in any customDimension: inspect the Vitest spy's call arguments; no call contains the raw test input string.
</verification>

<success_criteria>
Contributes to SC#1 (complete event stream, raw question absent), SC#4 (message_id correlation key available for Plan 03 feedback), and addresses Pitfalls 3 and 15 (positional analysis signal + real-query coverage via question_hash grouping).

- [ ] Every server-emitted event listed in CONTEXT.md §Event naming is actually emitted by /api/chat
- [ ] Each event carries session_id_hash + user_id_hash + request_id + message_id
- [ ] PII-absence test passes (spy-based assertion on dimension maps)
- [ ] Question hash is stable under case/whitespace variation and changes under salt rotation
- [ ] Phase 2 chat route tests remain green; no behavioural regression
- [ ] 597+ unit tests and 19/19 E2E tests green
</success_criteria>

<output>
After completion, create `.planning/phases/06-telemetry-evals-and-pilot-hardening/06-02-SUMMARY.md`. Frontmatter should note: `subsystem: telemetry`, `patterns.added: [hashQuestion + normalisation, EventSchema catalog, server-side trackEvent wiring]`, `decisions.made: [session_id_hash = sub+oid not cookie binary; first-turn gating for session_start/role_selected]`, `files.key: [src/obs/questionHash.ts, src/obs/eventSchema.ts, src/app/api/chat/route.ts]`.
</output>

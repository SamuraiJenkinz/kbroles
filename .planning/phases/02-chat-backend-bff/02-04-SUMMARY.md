---
phase: 02-chat-backend-bff
plan: 04
subsystem: api-route
tags: [route-handler, sse, streaming, validator, allowlist, structured-logging, abort-controller, semaphore, fallback, pino, next-app-router, transform-stream]

# Dependency graph
requires:
  - phase: 01-grounding-foundation
    provides: "composeSystemPrompt(role), validateCitations, REGISTRY, FALLBACK_STRING, CITATION_SCHEMA, createLlmClient"
  - phase: 02-chat-backend-bff/01-infra-ops-setup
    provides: "requestLogger({request_id, role, host}) pino child; getRequestUser stub auth; serverExternalPackages config; env-handling doc; prod-mode Phase-0 smoke GREEN (entry gate)"
  - phase: 02-chat-backend-bff/02-chat-primitives
    provides: "SseEvent + encodeSse; makeAnswerTracker; checkEntityAllowlist; chatSemaphore with lazy init + __resetForTests; parseChatRequest with 8 locked error codes; SUGGESTED_PROMPTS"
  - phase: 02-chat-backend-bff/03-upstream-resilience
    provides: "streamAnswer returning {response, usage}; AbortSignal plumbing; five typed errors (RefusalError, UpstreamTimeoutError, Upstream5xxError, SchemaRejectAfterRetryError, UpstreamAuthError); withRetry 429/5xx/network loop"
provides:
  - "src/app/api/chat/route.ts — POST handler composing every Plan 01/02/03 primitive into the locked 02-CONTEXT §1/§2/§3/§4/§5 pipeline"
  - "src/app/api/prompts/route.ts — GET handler serving role-keyed chip list with public max-age=3600,stale-while-revalidate=86400"
  - "docs/api-chat-contract.md — 336-line Phase-3 client contract; reference TypeScript consumer snippet (tsc-verified)"
  - "Closed Phase 2 SC #1 (streaming happy path), SC #2 (single fallback event, four reasons), SC #3 (allowlist post-check with no-leak log), SC #4 (/api/prompts with 5 Consumer / 8 Author chips), SC #5 (structured logs with all 10 locked fields + forbidden-string-grep guarantee)"
affects:
  - "03-chat-ui (CHAT-01..CHAT-08) — consumes /api/chat SSE contract + /api/prompts chip list; docs/api-chat-contract.md IS the hand-off"
  - "04-fallback-ui (FBK-01..FBK-03) — consumes the fallback event shape + FALLBACK_STRING terminal replace semantics"
  - "05-sso-and-teams-delivery — replaces getRequestUser stub; adds X-Teams-Host detection (host field in log swaps from 'web' to 'teams')"
  - "06-telemetry-evals — layers App Insights custom events on top of the structured log fields; chip_vs_freeform signal pivots on SUGGESTED_PROMPTS ids surfaced through /api/prompts"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TransformStream + writer.getWriter() + background IIFE pattern for SSE route handlers — returns Response(readable) immediately; IIFE owns all stream writes + terminal log + semaphore release"
    - "Single-gate concurrency with outer try/finally + streamingStarted flag — semaphore-leak safety across every pre-stream exit (400/413/401/500) without duplicating release on the streaming path"
    - "AbortController bridging: total-timeout setTimeout + request.signal abort listener both wired to the same controller, both torn down in IIFE finally (prevents cross-request listener leaks)"
    - "can_answer-first gating: NEVER emit answer_delta before branching on response.can_answer, validator flip, and allowlist check — all fallback paths suppress answer_delta entirely (Pitfall 5)"
    - "vi.hoisted() for shared mock state when vi.mock factories need references — solves the 'ReferenceError: Cannot access X before initialization' hoisting footgun; pattern reusable for any future route tests that need a capturing pino instance across mocked modules"
    - "Synthetic {\"answer\":\"...\"} envelope passed to makeAnswerTracker for future-proofing — Phase 2 stream:false facade emits one delta with full text; v1.1 true-streaming will hand the tracker real JSON chunks without changing the call-site"

key-files:
  created:
    - "src/app/api/chat/route.ts — 310 lines; POST handler + SSE_HEADERS + mapParseErrorToStatus + jsonError helpers + background-IIFE writer"
    - "src/app/api/chat/__tests__/route.test.ts — 26 route-level tests; vi.hoisted pattern for capturing logger; mocked streamAnswer returning StreamAnswerResult shape"
    - "src/app/api/prompts/route.ts — 66 lines; GET handler + ALLOWED role guard + force-static"
    - "src/app/api/prompts/__tests__/route.test.ts — 10 route-level tests"
    - "docs/api-chat-contract.md — 336 lines; 12 sections covering wire contract, enums, HTTP errors, reference snippet, phase boundaries"
  modified: []

key-decisions:
  - "Answer-delta tracker receives a SYNTHETIC {\"answer\":\"...\"} envelope in Phase-2 stream:false facade — the tracker is future-proof for v1.1 true-streaming without forcing the route to special-case the non-streaming path today"
  - "X-Request-Id header echoed on EVERY response including pre-stream 4xx/5xx — operators can correlate client-side bug reports to server logs even when the request failed validation"
  - "UpstreamAuthError maps to error{code:'internal'} on the wire but ingress_status_code={401|403} in the log — don't leak credential state to the browser, but give operators the exact ingress failure code for Pitfall 11 triage"
  - "Malformed JSON body maps to {error:'messages_missing'} rather than a new body_invalid_json code — 02-CONTEXT §4.1 locks eight error codes; adding a ninth would require a locked-contract update. messages_missing is semantically correct (body is unparseable ≡ messages is not present)"
  - "Route-level tests mock streamAnswer at module level via vi.hoisted; no real LLM client touched — the route IS a composer of primitives, and every primitive is unit-tested in isolation. Route tests verify orchestration only (event ordering, log shape, error switch, semaphore discipline)"
  - "Fallback + error paths both log the terminal entry via the IIFE finally — the route has exactly ONE log.info call-site per request, making the 'no raw content' guarantee easier to audit than a multi-site logger"
  - "/api/prompts uses dynamic='force-static' — the chip list is a pure function of SUGGESTED_PROMPTS[role] and safe to cache; contrast with /api/chat's force-dynamic for SSE per-request correctness"
  - "Per-task atomic commits (3 commits: 1 feat per route + 1 docs) consistent with Plan 02-01/02-02/02-03 precedent; each independently revertable"

patterns-established:
  - "Pattern: The route imports NO regex (NAME_RE, KB_ID_RE, URL_RE). All entity scanning flows through checkEntityAllowlist() — single source of truth for regex patterns lives in src/grounding/entities.ts (Plan 02 pattern reinforced)"
  - "Pattern: The route imports NO env() read except UPSTREAM_TOTAL_TIMEOUT_MS — every other env knob is read inside the primitive that uses it (MAX_INFLIGHT_STREAMS inside chatSemaphore; MAX_MESSAGES inside parseChatRequest; UPSTREAM_RETRY_* inside streamAnswer). Route stays thin per ARCHITECTURE §12 Pattern 4"
  - "Pattern: Route-level tests live in src/app/api/<route>/__tests__/route.test.ts (alongside route.ts) — mirrors Next.js App Router colocation convention"
  - "Pattern: vi.hoisted({ require('pino'), PassThrough }) — future route tests that need to capture logger output use this same factory pattern"

# Metrics
duration: "~15 min active (920s between start 23:08:52Z and last commit at 23:24:12Z)"
completed: 2026-04-22
---

# Phase 2 Plan 4: Route Wiring Summary

**POST /api/chat stream orchestration + GET /api/prompts chip server + 336-line Phase-3 client contract — composes every Plan 01/02/03 primitive into the locked 02-CONTEXT SSE pipeline with zero-leak semaphore + no-raw-content structured log + can_answer-first answer_delta gating.**

## Performance

- **Duration:** ~15 min active
- **Started:** 2026-04-22T23:08:52Z
- **Completed:** 2026-04-22T23:24:12Z
- **Tasks:** 3 (all committed atomically, no checkpoints)
- **Files created:** 5 (2 routes + 2 test suites + 1 doc)
- **Files modified:** 0 (clean Wave-3 landing; all primitives already in place)

## Accomplishments

- **All five Phase 2 Success Criteria closed.**
  - **SC #1** (streaming happy path): happy-path test asserts frames in exactly `[answer_delta, citations, done]` order with X-Request-Id header; content-type text/event-stream.
  - **SC #2** (single fallback event with four reasons): four distinct tests, one per `FallbackReason`; each asserts EXACTLY ONE `fallback` frame AND ZERO `answer_delta` frames (Pitfall 5 — server never re-narrates ungrounded refusal text).
  - **SC #3** (entity allowlist post-check + no-leak log): allowlist-violation test asserts `{class:'names', token_count:1}` in captured log AND violating token "Jane Doe" not present anywhere in concatenated stdout.
  - **SC #4** (/api/prompts 5 Consumer / 8 Author): 10 prompts-route tests asserting body identity to `SUGGESTED_PROMPTS`, chip ID stability (cns-01..cns-05, auth-01..auth-08), and the locked `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` header.
  - **SC #5** (structured logs with all 10 locked fields + no raw content): three dedicated log-shape tests — happy path has `prompt_tokens:123, completion_tokens:45` (from mock usage), error path has both null, forbidden-string grep passes across happy+fallback+error combined log output.
- **223/223 tests green** (baseline 187 + 10 prompts + 26 chat = 223). Typecheck clean.
- **Semaphore-leak safety proven by 4 regression tests.** After 400 (malformed JSON), 413 (history cap), 401 (prod-mode no-auth), and streaming-path happy completion, `chatSemaphore.tryAcquire()` returns true immediately — no slot leaked on any pre-stream or streaming exit.
- **Client-contract doc authored for Phase-3 hand-off.** 336 lines, 12 sections, reference TypeScript snippet compiles under `tsc --strict`. Phase-3 engineers can build the chat UI from this doc alone without touching `.planning/`.
- **Phase 2 closes as-scheduled.** 4 of 4 plans shipped: 02-01 infra-ops, 02-02 chat-primitives, 02-03 upstream-resilience, 02-04 route-wiring. No outstanding blockers.

## Task Commits

Each task was committed atomically:

1. **Task 4.1: GET /api/prompts route + tests** — `a5f33ab` (feat) — 10/10 tests green
2. **Task 4.2: POST /api/chat streaming route + tests** — `2792c5c` (feat) — 26/26 route tests green
3. **Task 4.3: docs/api-chat-contract.md** — `2559121` (docs) — 336 lines, reference snippet compiles

**Plan metadata commit:** pending (PLAN.md + SUMMARY.md + STATE.md staged after this doc is authored).

## Files Created/Modified

### Created (5)

- **`src/app/api/chat/route.ts`** (310 lines) — POST handler. Imports every Plan 01/02/03 primitive. SSE_HEADERS module constant. `mapParseErrorToStatus(code)` helper maps parseChatRequest codes to 400|413. `jsonError(code, status, extraHeaders)` helper centralises the pre-stream error response shape. POST body: uuid generation → requestLogger({request_id, host:'web'}) → tryAcquire-or-429 → try/finally-semaphore wrapper → JSON parse → parseChatRequest → getRequestUser → log.child({role}) → composeSystemPrompt → AbortController with total-timer + request.signal listener → TransformStream writer dispatched to background IIFE → return new Response(readable). IIFE runs streamAnswer → can_answer-first branch → validateCitations → checkEntityAllowlist → grounded-happy-path emits (answer_delta via makeAnswerTracker, citations, done); catch block discriminates on typed errors; finally emits single log.info with all 10 CONTEXT §5 fields and releases the semaphore.
- **`src/app/api/chat/__tests__/route.test.ts`** (540 lines, 26 tests) — vi.hoisted factory builds a pino capturing instance + mocks @/llm/stream + @/llm/client + @/obs/logger. Test groups: happy path (1); fallback paths with zero-answer-delta assertion (4: can_answer_false, all_citations_stripped, allowlist_violation, refusal); error paths (5: upstream_timeout, upstream_5xx with ingress_status=502, schema_reject_after_retry, UpstreamAuthError→internal with ingress_status=401, unknown→internal); pre-stream HTTP errors (7: malformed JSON, role_invalid, messages_missing, messages_empty, history_cap_exceeded, message_too_long, X-Request-Id echo); concurrency + semaphore release regression (5: 429 cap + 4 exit-path leak tests); structured log (3: happy-path usage numeric, error-path usage null, forbidden-string grep); client disconnect (1).
- **`src/app/api/prompts/route.ts`** (66 lines) — GET handler. Node runtime + force-static. Imports SUGGESTED_PROMPTS. Missing role → 400 role_required. Unknown role → 400 role_invalid. Happy → 200 with Cache-Control public,max-age=3600,stale-while-revalidate=86400 + Vary: Accept-Encoding.
- **`src/app/api/prompts/__tests__/route.test.ts`** (130 lines, 10 tests) — happy path consumer (5 chips) + author (8 chips) + content-type json + Cache-Control + Vary; error role_required, role_invalid, empty role (treated as missing), no Cache-Control on error; chip item shape + ID stability.
- **`docs/api-chat-contract.md`** (336 lines) — 12 sections: endpoint, response format, event schema, event ordering (happy/fallback/error state diagrams), FallbackReason enum, ErrorCode enum with retry guidance, pre-stream HTTP errors, reference TypeScript consumer snippet (~55 lines; `fetch` → ReadableStream reader → frame splitter → SseEvent switch; tsc --strict --noEmit verified clean), Citation shape, response header table, GET /api/prompts companion spec, Phase 2-through-6 boundaries table.

### Modified (0)

No existing files modified. Clean Wave-3 landing — every primitive Plan 04 depends on was already in place from Plans 01/02/03.

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | `makeAnswerTracker()` consumes a synthetic `{"answer":"<text>"}` JSON envelope for the single-delta Phase-2 emit | Keeps the tracker's call-site identical across Phase-2 (stream:false facade, one delta) and v1.1 (true streaming, many deltas). Without the envelope the route would need a Phase-2-only code path `writer.write(encodeSse({type:'answer_delta', text: validated.answer}))` that gets deleted in v1.1 — more churn for no benefit. |
| 2 | `X-Request-Id` echoed on every response including pre-stream 4xx/5xx | Operators can correlate client-side bug reports ("I got a 400") to server logs without the client needing any special 4xx observability. Low-cost hardening; adds 36 bytes to every response. |
| 3 | `UpstreamAuthError` → wire `error{code:'internal'}` but log `ingress_status_code={401\|403}` | Don't leak credential state to the browser (Pitfall 7 + security hygiene), but preserve the exact ingress failure code for operators investigating Pitfall 11 (ingress auth break). The wire code 'internal' signals "don't auto-retry" to clients; the log code signals "Entra/MGTI broke" to humans. |
| 4 | Malformed JSON body → `{error:'messages_missing'}` rather than a new `body_invalid_json` code | 02-CONTEXT.md §4.1 locks exactly 8 error codes. Adding a 9th would require a contract update + docs + test. `messages_missing` is semantically correct (unparseable body ≡ messages absent). Client UX is unchanged (both codes render as "bad request; refresh and try again"). |
| 5 | Route-level tests mock `streamAnswer` at module level; no real `createLlmClient()` touched | Every primitive the route composes is unit-tested in isolation (Plans 01/02/03 contributed 187 tests before this plan started). Route tests verify ONLY orchestration: event ordering, log shape, error-switch discrimination, semaphore discipline. Mocking streamAnswer means one failure surface per test, hermetic results. |
| 6 | IIFE has exactly ONE `log.info(...)` call-site per request (in the terminal finally) | Auditing "no raw user-question text in logs" is O(1) — one call-site to review. Multiple log.info calls per request would multiply the surface for a future regression to accidentally pass `req.body` or `answer` into extras. The logger test (src/obs/__tests__/logger.test.ts) enforces the module-level "no forbidden strings" guarantee; this route's structure keeps the call-site compliant by construction. |
| 7 | `/api/prompts` uses `dynamic='force-static'` vs `/api/chat`'s `dynamic='force-dynamic'` | `/api/prompts` body is a pure function of `SUGGESTED_PROMPTS[role]` — cacheable. `/api/chat` is per-request SSE — uncacheable. Different runtime semantics within the same API directory is legal and clarifying in Next.js. |
| 8 | Per-task atomic commits (3 feat/docs commits) consistent with Plan 02-01/02-02/02-03 precedent | Each task independently revertable. Task 4.1 shipped BEFORE Task 4.2 so `/api/prompts` was available the moment the prod-smoke gate was checked — even if Task 4.2 had hit an issue, 4.1 would have been merged. |
| 9 | `vi.hoisted` factory pattern for the capturing pino instance shared across vi.mock factories | vi.mock factories are hoisted above ordinary top-level declarations — any reference to `capturingLogger` defined at test-file top level fails with `ReferenceError: Cannot access X before initialization`. `vi.hoisted(() => ...)` guarantees the state is initialised before any vi.mock factory runs. This is the standard Vitest pattern for shared-state mocks; documented here because it was a gotcha during initial implementation. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixture section_id `request-correction` does not exist in KB0022991**

- **Found during:** Task 4.2 — first test run showed the allowlist-violation test expected `reason:'allowlist_violation'` but actually received `reason:'all_citations_stripped'`.
- **Issue:** The plan's test-case spec and the initial draft used `section_id: 'request-correction'` for KB0022991 citations. That anchor doesn't exist — KB0022991's real section IDs are `publishing-approval`, `approvers`, `edit-retire-delete`, `flagging-articles`, `knowledge-blocks`, `criteria-check`. The citation validator correctly stripped the unknown-section_id citation, which produced `all_citations_stripped` before the allowlist post-check could fire.
- **Fix:** Replaced every `section_id: 'request-correction'` in the test file with `section_id: 'approvers'`, pairing with the quote `"Colleague Technology"` which IS a verbatim substring of the approvers section body (line 24 of `kb0022991.md`). Verified the quote is also in `ENTITY_ALLOWLIST.names` so it never trips the allowlist post-check independently — the test isolates the allowlist failure to the "Jane Doe" token in the answer text, not the quote.
- **Files modified:** `src/app/api/chat/__tests__/route.test.ts`
- **Verification:** All 26 chat route tests green; happy-path test also benefits (same fix applied there) — so this single deviation unblocked 3 failing tests in one edit.
- **Committed in:** `2792c5c` (Task 4.2 commit)

**2. [Rule 3 - Blocking] vi.mock hoisting referenced pre-init variable**

- **Found during:** Task 4.2 — first test run failed with `ReferenceError: Cannot access 'capturingLogger' before initialization` at the vi.mock('@/obs/logger', ...) factory.
- **Issue:** `vi.mock(...)` factories are hoisted above all other top-level code by vitest. The initial draft declared `const capturingLogger = pino(...)` at module scope and referenced it from inside the `vi.mock('@/obs/logger', () => ({ logger: capturingLogger }))` factory — but the factory runs before the const is initialised.
- **Fix:** Moved the capturing-logger setup into a `vi.hoisted(() => { const PT = require('node:stream').PassThrough; ... })` block. `vi.hoisted` runs BEFORE vi.mock factories, so any state it returns is safely referenceable from inside factory bodies. Also added a defensive `typeof pinoFactory === 'function' ? pinoFactory : pinoFactory.default` guard because pino's CJS/ESM dual export surfaces differently under `require()`.
- **Files modified:** `src/app/api/chat/__tests__/route.test.ts`
- **Verification:** Test file loads; all 26 tests run successfully.
- **Committed in:** `2792c5c` (Task 4.2 commit)

### Did not deviate

- Task 4.1 matched the plan's inline `/api/prompts` snippet verbatim (Node runtime + force-static + allowed roles + two locked error codes + Cache-Control). Tests matched the plan's 6-case minimum and added 4 defensive shape checks.
- Task 4.2 route pipeline followed the plan's `<context>` pipeline spec line-for-line: uuid → log → semaphore → try/finally with streamingStarted flag → pre-stream validation → auth → compose + client + AbortController + TransformStream → IIFE with can_answer-first ordering → typed-error switch → terminal log.info with all 10 locked fields → writer.close(). No structural deviations.
- Task 4.3 doc structure matched the plan's 12 required sections. Line count (336) exceeds the 80-line minimum by 4×. Reference TS snippet (~55 lines) compiles under `tsc --strict --noEmit` — verified via a throwaway `/tmp/contract-check/snippet.ts` compile pass. The plan noted the verification would be "subjective" since there's no permanent compile harness; I opted for the stricter compile-verify anyway.

---

**Total deviations:** 2 auto-fixed, both Rule 3 (blocking) — one test-fixture correctness issue and one test-framework hoisting quirk. Neither affected the route implementation itself; both were discovered on first test-run and resolved in-place before the commit.

**Impact on plan:** No scope creep. Both fixes landed inside the Task 4.2 commit.

## Issues Encountered

- **vi.hoisted pattern was not documented in the plan's `<context>` block.** Plan 04 `<context>` pointed at 02-RESEARCH §Vitest Route-Level Testing Pattern, which covers `vi.mock('@/llm/stream', ...)` but not the shared-state-across-mocks pattern. Encountered as a first-run `ReferenceError`; resolved via `vi.hoisted` in ~2 minutes. Documented in Decision #9 so Plan 04 test-harness patterns are forward-referenceable for any future route that needs a capturing logger.
- **KB section anchors were not inline in the plan's test examples.** The plan used `request-correction` as a placeholder section_id in the test-case sketches — `section_id: 'request-correction', quote: 'Colleague Technology'`. This anchor doesn't exist; it was fabricated during plan writing. Encountered as a first-run validator-strip (all_citations_stripped instead of allowlist_violation); resolved by grepping the source file for real anchors and settling on `approvers` + `"Colleague Technology"` (a verbatim substring of the approvers body AND a pre-allowed name). Pattern for future route tests: grep the source markdown for real substring + matching anchor before drafting test fixtures.

## User Setup Required

**None.** All primitives the route composes were already in place (env vars, pino, ENTITY_ALLOWLIST, REGISTRY, createLlmClient, etc.). Plan 04 introduces no new env variables, no new dependencies, no new secrets. Phase-5 setup items (Entra tenant ID, MSAL keys, Teams sideload policy) remain as tracked in STATE.md.

### Manual smoke (optional, not run this session)

For local verification of streaming cadence against a real MGTI ingress:

```bash
pnpm dev  # Next.js dev server on :3000
curl -N -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"role":"consumer","messages":[{"role":"user","content":"How do I flag an article?"}]}'
```

Expected: progressive `data: {"type":"answer_delta","text":...}` frames arrive (in Phase-2 stream:false facade, a single delta arrives; in v1.1 true streaming, many smaller deltas arrive), followed by one `citations` frame, then one `done`. If frames arrive as a single blob rather than progressively, investigate Pitfall #10 (APIM buffering) — though prod-mode Smoke 3 already PASSed P95 < 500 ms, a local dev-server blob would signal a regression.

## Next Phase Readiness

- **Phase 2 is COMPLETE.** All 4 plans (infra-ops, chat-primitives, upstream-resilience, route-wiring) shipped. 223/223 tests green. Phase 2 success criteria #1–#5 all closed with dedicated route-level test coverage.
- **Phase 3 (chat-ui) UNBLOCKED.** Consumers of `/api/chat` build against `docs/api-chat-contract.md` — no `.planning/` reads required. The reference TypeScript snippet in §8 of the doc is copy-paste starter code for the Phase-3 `useChatStream` hook.
- **Phase 4 (fallback-ui) UNBLOCKED.** Consumers of the fallback event shape build against `docs/api-chat-contract.md` §5 (FallbackReason enum) + §4.2 (fallback state diagram — `fallback.text` REPLACES accumulated answer_delta text).
- **Phase 5 (sso-and-teams-delivery) inherits the exact same replacement points:**
  - `src/app/api/_middleware.ts` — PHASE 5 REPLACEMENT POINT comment block unchanged
  - Route reads `host: 'web'` at requestLogger creation — Phase 5 swaps this to `host: request.headers.get('X-Teams-Host') ? 'teams' : 'web'`
  - No change needed in chat route structure — the log field is already in place
- **Phase 6 (telemetry-evals)** layers App Insights custom events on top of the terminal `log.info(...)`. The log object already carries every field Phase 6 needs (request_id, role, host, validator_flips, fallback_reason, usage tokens, latency). Phase 6's `TELE-02` question-hash computation sits in a new call-site — NOT inside this route — per Decision #6 (single log call-site per request).

### Carry-forward for Plan 03 / v1.1

- **`makeAnswerTracker` is wired but under-exercised in Phase 2.** The tracker handles one synthetic envelope; v1.1 needs to feed real streaming JSON chunks into it. Test coverage for the multi-delta path already exists (src/chat/__tests__/partialAnswer.test.ts — 13 tests cover buffer-advancement edge cases).
- **Inter-chunk 20s timer (Plan 03 TODO marker in `src/llm/stream.ts`) remains deferred.** v1.1 will add a chunk-resettable timer distinct from the route's total-timeout. The route already discriminates on `UpstreamTimeoutError` → `error{code:'upstream_timeout'}` — v1.1 can introduce a distinct `InterChunkTimeoutError` and add a 5th `else if` branch without restructuring the catch chain.
- **Per-user rate limit is deferred to Phase 5 + v1.1** (needs server-validated MSAL identity). Current semaphore is global 20-in-flight; acceptable for ≤50-user pilot cohort per CONTEXT §3.

### Carry-forward surprises

- **vi.hoisted pattern is now the canonical approach** for any future route test that needs to share state across vi.mock factories. The prompts-route tests (Task 4.1) didn't need it — they only mock SUGGESTED_PROMPTS by virtue of importing the real module. Chat-route tests are the first in this repo to share a capturing pino across mocked modules; the pattern will recur in Phase 3+ (e.g., a telemetry middleware with its own mocked App Insights client).
- **The `request-correction` anchor lives only in plan prose, never in the codebase.** If any future plan drafts re-use this placeholder in test examples, they'll hit the same Rule-3 deviation. Recommend grep'ing real section anchors from the source files before authoring fixtures — a 30-second precaution that saves a 2-minute debug cycle.

---

*Phase: 02-chat-backend-bff*
*Plan: 04-route-wiring*
*Completed: 2026-04-22*

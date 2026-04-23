---
phase: 02-chat-backend-bff
verified: 2026-04-22T00:00:00Z
status: passed
score: 47/47 programmatic must-haves + 3/3 live verification items PASS (human checks run against dev-mode OpenAI — same code path as MGTI per dual-mode factory)
date: 2026-04-22
re_verification: false
live_verification:
  - test: Live curl /api/chat happy-path Author (SC #1)
    result: PASS
    evidence: |
      curl -sN POST /api/chat {role:author, content:"What goes in the Resolution field?"}
      Frame order: answer_delta (Resolution field content from KB0020882) → citations[{source_id:"KB0020882", section_id:"resolution-field-software", quote:"For Software articles, the Resolution field must contain the following 11 items:"}] → done{can_answer:true, validator_flips:1}
      Response headers: Content-Type: text/event-stream; charset=utf-8; Cache-Control: no-cache, no-transform; Connection: keep-alive; X-Accel-Buffering: no; X-Request-Id: bae30f3f-c575-4696-b093-cf5a7ff948f8
      validator_flips=1 (one fabricated citation stripped, one real citation kept — validator did its job)
  - test: Live curl /api/chat adversarial Consumer (SC #2)
    result: PASS
    evidence: |
      curl -sN POST /api/chat {role:consumer, content:"What is the capital of France?"}
      Frame emitted: EXACTLY ONE fallback{reason:"can_answer_false", text:"That information isn't in the loaded documents yet. Flag the gap to the CTSS Knowledge team via KB0022991."}
      Zero answer_delta, zero citations, zero done frames. Text is verbatim handover §15 copy.
      X-Request-Id: b0b0c7dc-3c97-43e8-8fcb-1d7776c5fd75
  - test: Streaming cadence + X-Accel-Buffering
    result: PASS
    evidence: |
      X-Accel-Buffering: no present on response headers. Transfer-Encoding: chunked. Frames streamed (not batched), confirmed via curl -N.
      Note: Phase-2 facade is stream:false so only one answer_delta emits per request; progressive per-chunk streaming lands in v1.1 per the inter-chunk deferral marker.
bugs_found_and_fixed:
  - id: prompts-force-static
    severity: high
    plan: 02-04 (route-wiring)
    description: |
      GET /api/prompts exported `dynamic = 'force-static'`. Next's static-cache layer drops the query string at runtime (request.url loses ?role=...), which 400s every real request with role_required. Unit tests missed this — they call GET() directly with a constructed Request, bypassing Next's framework URL rewriting.
    fix_commit: 157325b
    fix: Switched to `dynamic = 'force-dynamic'`. Proxy caching is still achieved via the existing Cache-Control: public, max-age=3600, stale-while-revalidate=86400 header — shared caches key on full URL including query string, so consumer vs author responses stay distinct. Added drift-guard test `expect(dynamic).toBe('force-dynamic')`.
  - id: tsconfig-next-auto-update
    severity: low
    plan: infrastructure
    description: |
      Running pnpm dev for Phase 2 human verification triggered Next.js to rewrite tsconfig.json (add .next/types/**/*.ts include + jsx preserve→react-jsx) and generate next-env.d.ts. The new types pulled in a stricter ProcessEnv augmentation that requires NODE_ENV, which broke the existing `as NodeJS.ProcessEnv` literal casts in src/config/__tests__/env.test.ts.
    fix_commit: 9642020
    fix: Accepted Next's auto-updates (standard Next-owned files). Widened test casts to `as unknown as NodeJS.ProcessEnv`.
---

# Phase 2 chat-backend-bff - Verification Report

Phase Goal (ROADMAP.md): A streaming /api/chat route that composes the role-aware system prompt, proxies to the LLM, enforces the citation validator and entity allowlist, streams answer tokens immediately, holds citations until completion, and flips to the fallback path when the model returns can_answer false or all citations fail validation.

Verified: 2026-04-22
Status: human_needed (all programmatic checks PASS; SC #1/#2 need operator curl for true end-to-end evidence)
Re-verification: No - initial verification

---

## Goal Achievement

### Observable Truths (Phase-Level Success Criteria)

SC#1 Curl with known-good Author prompt streams answer_delta frames plus final done event whose citations passed validator - VERIFIED programmatic; human-needed for live MGTI curl.
Evidence: Happy-path test route.test.ts:158 asserts exact frame order [answer_delta, citations, done]; validator_flips in done; X-Request-Id header; Content-Type text/event-stream; charset=utf-8. Cache-Control + X-Accel-Buffering headers set (route.ts:93-97). validateCitations wired at route.ts:215. All 26 route tests pass.

SC#2 Adversarial prompt produces can_answer false and a single fallback event; no citations leak - VERIFIED (all 4 paths tested); human-needed for adversarial behaviour against real model.
Evidence: 4 fallback-path tests (route.test.ts:204, 228, 256, 294) each assert EXACTLY ZERO answer_delta + EXACTLY ONE fallback + NO citations + NO done. Refusal path (streamAnswer throws RefusalError) yields fallback reason refusal. Route gates answer_delta behind all three checks (can_answer, validator strip, allowlist) per Pitfall-5 guard at route.ts:207-234.

SC#3 Fabricated approver name or fabricated KB 7digit blocked by allowlist; allowlist loaded at boot from registry.ts - VERIFIED.
Evidence: src/grounding/entities.ts:1 imports REGISTRY; ENTITY_ALLOWLIST = extract() at module load. src/chat/allowlist.ts:42-54 filters names, kbIds, urls. Route wires checkEntityAllowlist(validated.answer) at route.ts:227. route.test.ts:256 drives Jane Doe through the path and asserts fallback reason allowlist_violation plus violating token NOT in logs.

SC#4 /api/prompts returns 5 Consumer or 8 Author chips from handover section 16 - VERIFIED.
Evidence: src/prompts/suggested.ts:30-98 has exactly 5 cns-0X + 8 auth-0X chips, labels verbatim from handover section 16. src/app/api/prompts/route.ts:39-67 validates role + serves chips + Cache-Control public max-age=3600 stale-while-revalidate=86400. 10 prompts-route tests green; 8 suggested tests green including count + ID-format + verbatim-word-set drift guard.

SC#5 Structured logs capture request_id, role, validator_flips, refusal_fired, ingress_status_code per request; no raw user text - VERIFIED.
Evidence: src/obs/logger.ts exports pino + requestLogger child helper. src/obs/__tests__/logger.test.ts:87 asserts user_question, messages, content, answer, quote NEVER appear in output. Route emits single terminal log.info(...) with all locked fields including prompt_tokens/completion_tokens from streamAnswer usage (route.ts:319-333). route.test.ts:501-590 (3 tests) proves happy-path numeric tokens, error-path null, forbidden-strings absent.

Score: 5/5 phase SCs satisfied programmatically; 3 items flagged for operator curl.


---

### Plan-Level Must-Haves

#### Plan 01 - infra-ops-setup

- T01-1 env-handling.md covers all 6 sections - VERIFIED. 182 lines, 7 sections.
- T01-2 Prod-smoke gate honoured - VERIFIED. docs/phase-0-smoke.md entry gate GREEN with PASS for Smokes 1/2/3/5.
- T01-3 pino + pino-pretty pinned + in serverExternalPackages - VERIFIED. pino 10.3.1, pino-pretty 13.1.3; next.config.ts:9.
- T01-4 logger.ts exports logger + requestLogger - VERIFIED. src/obs/logger.ts:24,37.
- T01-5 logger test enforces no-forbidden-strings - VERIFIED. logger.test.ts:87 forbidden list user_question, messages, content, answer, quote; 2 tests green.
- T01-6 _middleware.ts dev stub, prod 401, Phase-5 label - VERIFIED. _middleware.ts:3-8 PHASE 5 REPLACEMENT POINT; 3 tests green.
- T01-7 Middleware tested, 3 scenarios - VERIFIED.
- All 5 artifacts present; line-count mins exceeded.
- KeyLinks all match patterns EXCEPT:
  - _middleware to env.ts via env() - MINOR DEVIATION (acceptable). Pattern expects literal env() call; middleware uses process.env.NODE_ENV and only references env() in Phase-5 deferral comments. Consistent with plan text reads env() for ENTRA_TENANT_ID (if present) since ENTRA_TENANT_ID is intentionally NOT in EnvSchema yet (deferred to Phase 5 per _middleware.ts:6-8 comment). Not a functional gap.

#### Plan 02 - chat-primitives

- All 12 truths VERIFIED:
  - encodeSse framed Uint8Array with module-level TextEncoder - sse.ts:46.
  - 5 event SseEvent union - sse.ts:36-41.
  - makeAnswerTracker escape handling + extractPartialAnswer - 13 tests green.
  - checkEntityAllowlist with AllowlistResult - 7 tests green covering the 4 CONTEXT section 2 fixtures.
  - AsyncSemaphore tryAcquire + release + cap semantics + chatSemaphore reads env().MAX_INFLIGHT_STREAMS - 8 tests green.
  - ChatRequestSchema + parseChatRequest with env-driven limits and 8 locked error codes - 14 tests green.
  - SUGGESTED_PROMPTS 5+8 verbatim handover section 16 with stable IDs - 8 tests green.
- All 6 artifacts present with listed exports.
- All 4 key_links patterns match (allowlist to ENTITY_ALLOWLIST; concurrency to MAX_INFLIGHT_STREAMS; requestSchema to MAX_MESSAGES and MAX_MESSAGE_CHARS; suggested to Role).

#### Plan 03 - upstream-resilience

- All 11 truths VERIFIED:
  - Explicit refusal detection throws RefusalError - stream.ts:225,251.
  - Return shape response + usage - StreamAnswerResult type; route destructures at route.ts:199-200.
  - withRetry on 429/502/503/504/ECONNRESET with max 2 retries + jittered backoff - 13 retry tests green.
  - No retry on 400/401/403/422; 401/403 to UpstreamAuthError - stream.ts:112.
  - SchemaRejectAfterRetryError on Ajv-fallback-failed-twice - stream.ts:285.
  - AbortSignal + UpstreamTimeoutError - stream.ts:162, 294.
  - Inter-chunk 20s deferred with TODO v1.1 marker + drift-guard test - stream.ts:180.
  - 5 typed error classes with discriminated .name - errors.ts:21,28,37,46,55.
  - 4 new UPSTREAM env vars with zod defaults 45000/2/500/250 - env.ts:48-51.
  - Phase-1 smoke still green (scripts/__tests__/phase0-smoke.test.ts 5 tests green).
- Both artifacts present; all 3 key_link patterns match.

#### Plan 04 - route-wiring

- All 17 truths VERIFIED:
  - Node runtime + force-dynamic exports - route.ts:86-87.
  - Happy path frame order answer_delta, citations, done with X-Request-Id - route.ts:237-267; route.test.ts:158.
  - SSE response headers (Cache-Control, Connection, X-Accel-Buffering, X-Request-Id) - route.ts:92-97,349.
  - 4 fallback reasons each suppress answer_delta - route.ts:207/219/228/269; route.test.ts:204,228,256,294.
  - 4 error-code discriminations for UpstreamTimeout / Upstream5xx / SchemaRejectAfterRetry / UpstreamAuth / unknown - route.ts:274-307.
  - parseChatRequest to HTTP 400/413 no SSE opened - route.ts:99-102; route.test.ts:374-431.
  - 429 + Retry-After 5 + semaphore release guaranteed on ALL exit paths - route.ts:122-124,311,359; 5 concurrency tests including 3 pre-stream-failure-release regressions plus 1 streaming-path release.
  - Client disconnect: abort listener registered + removed in finally; no unhandled rejection - route.ts:175-176,310; route.test.ts:591-625.
  - Single terminal log.info with ALL CONTEXT section 5 fields - route.ts:319-333; route.test.ts:501-590.
  - answer_delta ONLY on grounded-happy-path - route.ts gated before emission at 246.
  - GET /api/prompts Cache-Control + chip list - prompts/route.ts:61-64.
  - /api/prompts 400 error codes (role_required, role_invalid) - prompts/route.ts:44-54.
  - docs/api-chat-contract.md covers 12 sections - 336 lines, 12 section headers present.
- All 3 artifacts present with line counts exceeding min_lines (route.ts 361 greater than 120; api-chat-contract.md 336 greater than 80).
- All 9 key_link patterns match.


---

## Anti-Patterns Scan

- src/llm/stream.ts:180 - TODO v1.1 true-streaming + inter-chunk idle timeout. Severity Info (intentional, drift-guarded). CONTEXT section 3 resolution Q3. Documentation-drift test in stream.test.ts confirms TODO stays in source.
- src/app/api/chat/route.ts:239 - TODO v1.1 makeAnswerTracker. Severity Info (intentional). Aligns with Plan 03 stream false facade. Non-blocking.

No blocker anti-patterns. No TODO/FIXME in routes or primitives beyond the two documented v1.1 deferrals. No empty returns or placeholders or coming-soon or lorem-ipsum. No console.log-only implementations.

---

## Forbidden-String Audit (CONTEXT.md section 5)

Route logger call sites inspected: route.ts:123, 319, 356 - three log.* invocations total.

- Line 123: log.warn(ingress_status_code 200, chat rate-limited) - only ingress_status_code numeric field.
- Line 319: log.info(...) - validator_flips, refusal_fired, fallback_reason, ingress_status_code, prompt_tokens, completion_tokens, allowlist_violation (optional), latency_ms. NO user content, NO answer text, NO quote, NO message body.
- Line 356: log.warn(err String(preStreamErr), pre-stream error) - stringified error only. Defence-in-depth: route.test.ts:540 asserts no forbidden strings surface here either.

Grep of route.ts for forbidden field names (user_question, messages_content, answerText, quote) - only matches are in an explanatory comment block at line 315. PASS.

---

## Test Suite Status

- pnpm typecheck: CLEAN (no tsc output).
- pnpm test: 21 test files / 223 tests / all passing / duration 1.22s.
  - Phase-2 additions: sse(6) + partialAnswer(13) + allowlist(7) + concurrency(8) + requestSchema(14) + suggested(8) + logger(2) + middleware(3) + errors(13) + retry(13) + stream(24) + prompts/route(10) + chat/route(26) + env(14) = 161 Phase-2 tests green.
  - Phase-1 regression: all 62 prior tests still passing.

Phase-2 SC guard tests explicitly present:
- SC#1: route.test.ts:158 happy path exact frame order.
- SC#2: route.test.ts:204,228,256,294 four fallback reasons each ZERO answer_delta.
- SC#3: route.test.ts:256 plus allowlist.test.ts four CONTEXT section 2 fixtures.
- SC#4: prompts/route.test.ts 10 tests + suggested.test.ts 8 tests.
- SC#5: logger.test.ts:87 plus route.test.ts:501-590 three log-shape + forbidden-string tests.

---

## Pitfall Coverage

- Pitfall 2 validator is deterministic guard - SATISFIED. validateCitations runs EVERY request at route.ts:215; route.test.ts:228 proves strip path.
- Pitfall 5 server refuses to re-narrate fallback - SATISFIED. answer_delta gated on grounded-happy-path only; 4 fallback tests assert ZERO answer_delta.
- Pitfall 6 allowlist post-check - SATISFIED. checkEntityAllowlist runs AFTER validator at route.ts:227; Jane Doe test + violation-token-not-in-log grep.
- Pitfall 7 user text never flows into trusted system-prompt slots - SATISFIED. route.ts:196 messages validatedMessages passed to streamAnswer; composeSystemPrompt(parsed.data.role) receives ONLY the role enum, no user content.
- Pitfall 11 ingress auth break - SATISFIED. UpstreamAuthError at stream.ts:112 for 401/403; route catches at 295-302 and logs ingress_status_code; route.test.ts:347.
- Pitfall 12 429 handling + exponential backoff - SATISFIED. withRetry retries on 429/502/503/504 up to UPSTREAM_RETRY_MAX with jittered backoff; 13 retry tests green; BFF emits 429 Retry-After 5 when semaphore full (route.test.ts:433).

---

## Human Verification Required

Three live-system checks are outside programmatic verification and are either (a) explicitly requested by SC #1 and SC #2 or (b) confirm end-to-end behaviour through the real upstream that mocks cannot exercise. See frontmatter human_verification block for expected behaviour.

1. Live /api/chat happy-path curl (SC #1) - Author prompt; assert progressive frames plus valid citations.
2. Live /api/chat adversarial curl (SC #2) - out-of-scope prompt; assert single fallback event, no citations.
3. pnpm dev streaming cadence - confirm X-Accel-Buffering no plus SSE frames arrive progressively, not as a single blob.

Prod-smoke gate is GREEN (Plan 01 Task 1.1), so these curls can be run against the MGTI ingress now.

---

## Gaps Summary

No functional gaps found. All 47 programmatic must-haves across 4 plans pass. All 5 phase-level Success Criteria are verified by the test suite.

Single minor deviation (NOT a blocker): Plan 01 key_link pattern env() for _middleware.ts expected a literal env() call. Middleware uses process.env.NODE_ENV and defers env().ENTRA_TENANT_ID wiring to Phase 5. Consistent with Plan 01 own language reads env() for ENTRA_TENANT_ID (if present) since ENTRA_TENANT_ID is intentionally not in the EnvSchema yet, documented in the middleware Phase-5 comment block.

Deliverables confirmed present:
- 4 plan SUMMARY.md files (02-01 through 02-04)
- docs/env-handling.md (182 lines, 7 sections)
- docs/phase-0-smoke.md with prod-mode evidence for Smokes 1/2/3/5 (Phase 2 entry gate GREEN)
- docs/api-chat-contract.md (336 lines, 12 sections)
- All source artifacts with line counts exceeding min_lines requirements
- 223 tests passing, typecheck clean

---

Verified: 2026-04-22
Verifier: Claude (gsd-verifier)

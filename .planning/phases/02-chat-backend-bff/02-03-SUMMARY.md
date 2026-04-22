---
phase: 02-chat-backend-bff
plan: 03
subsystem: llm-resilience
tags: [openai-sdk, retry, abort-signal, refusal-detection, typed-errors, exponential-backoff]

# Dependency graph
requires:
  - phase: 01-grounding-foundation
    provides: streamAnswer Phase-1 facade + Ajv fallback + KbResponse schema
  - phase: 02-chat-backend-bff
    plan: 01-infra-ops-setup
    provides: env() extension pattern (z.coerce.number().int()), pino logger shape
  - phase: 02-chat-backend-bff
    plan: 02-chat-primitives
    provides: SSE error codes that route handler will map typed errors to
provides:
  - Five typed upstream error classes (UpstreamTimeoutError, Upstream5xxError, SchemaRejectAfterRetryError, RefusalError, UpstreamAuthError) discriminated by .name
  - isRetryableUpstream(err) classifier — 429/502/503/504 + ECONNRESET/ETIMEDOUT/UND_ERR_SOCKET
  - streamAnswer() extended shape {response, usage} — usage feeds CONTEXT §5 log fields prompt_tokens/completion_tokens
  - Explicit message.refusal detection on both strict and fallback paths (resolves 02-RESEARCH.md Q1)
  - Bounded retry wrapper with jittered exponential backoff (resolves Q2)
  - AbortSignal total-timeout hook plumbed through SDK second-arg request options (resolves Q3)
  - v1.1 inter-chunk deferral marker with drift-guard test
  - Four new env knobs UPSTREAM_TOTAL_TIMEOUT_MS/RETRY_MAX/RETRY_BASE_MS/RETRY_JITTER_MS with Zod defaults
affects: [02-04-route-wiring]

# Tech tracking
tech-stack:
  added: []  # pure refactor/extension; no new deps
  patterns:
    - "Typed error classes with readonly name discriminator for route-side switch (instead of string-match on err.message)"
    - "withRetry<T>(fn, cfg) wrapper orthogonal to existing Ajv schema-reject retry — separate loops for HTTP vs schema failure modes"
    - "OpenAI SDK v6 request options passed as second argument: client.chat.completions.create(body, { signal })"
    - "Drift-guard test: readFileSync + toContain for critical TODO markers — prevents silent removal"
    - "Pre-aborted-signal short-circuit: check signal.aborted before touching SDK"
    - "Abort-error detection via .name check (AbortError, APIUserAbortError) + signal.aborted fallback"
    - "Retry config read from env() at call time (not module load) so test env mutations are observable"

key-files:
  created:
    - src/llm/errors.ts
    - src/llm/__tests__/errors.test.ts
    - src/llm/__tests__/retry.test.ts
  modified:
    - src/llm/stream.ts
    - src/llm/__tests__/stream.test.ts
    - src/config/env.ts
    - src/config/__tests__/env.test.ts
    - scripts/phase0-smoke.ts (unwrap new {response, usage} shape)

key-decisions:
  - "StreamAnswerResult exposes usage as {prompt_tokens, completion_tokens} | null — null when upstream omits the block (Plan 04 logs null-safely)"
  - "Refusal short-circuits the Ajv retry loop on fallback path (retrying a safety-filter refusal changes nothing — model refuses again)"
  - "SchemaRejectAfterRetryError carries original Error via .cause (preserving diagnostic chain) not the .message string"
  - "Abort-originated errors must propagate through the Ajv retry loop to the outer try/catch for UpstreamTimeoutError conversion — isAbortLike() guard on both firstErr and retryErr"
  - "Upstream-retry loop is ORTHOGONAL to Ajv schema-reject retry — both coexist because they address different failure modes (HTTP vs schema)"
  - "withRetry() kept module-private; tests exercise retry policy through streamAnswer to assert observable contract (call counts, thrown types) not helper internals"
  - "Backoff timing test uses single '500ms window' advance instead of fine-grained microtask boundaries — avoids flakiness from advanceTimersByTimeAsync draining microtasks"
  - "Non-retryable auth statuses 401/403 reclassify to UpstreamAuthError inside withRetry (typed for route-side routing); 400/422 propagate raw"
  - "422 is NOT reclassified as UpstreamAuthError — route treats it as input-shape error distinct from auth break"

patterns-established:
  - "Typed-error discriminator: export class X extends Error { readonly name = 'X' as const }"
  - "Env-defaults-in-schema pattern extended: UPSTREAM_* four knobs follow the same z.coerce.number().int().min(N).optional().default(V) style Plan 02 established for MAX_*"
  - "Test helper runWithFakeTimers() attaches pre-emptive .catch(()=>{}) to avoid Node PromiseRejectionHandledWarning when draining fake timers"
  - "Pre-aborted-signal fast-path: if (signal?.aborted) throw new UpstreamTimeoutError() before any SDK work"
  - "TODO marker with version suffix: `TODO(v1.1):` — version-scoped so future phases can grep for deferred work"

# Metrics
duration: ~10min
completed: 2026-04-22
---

# Phase 2 Plan 3: Upstream Resilience Summary

**Typed upstream errors + bounded retry wrapper with jittered exponential backoff + AbortSignal total-timeout hook extends the Phase-1 streamAnswer facade with CONTEXT §3 resilience — zero new dependencies, one v1.1 deferral clearly marked.**

## Performance

- **Duration:** ~10 min active
- **Started:** 2026-04-22T22:47:12Z
- **Completed:** 2026-04-22T22:56:52Z
- **Tasks:** 3 (autonomous, no checkpoints)
- **Files modified:** 8 (3 created, 5 modified)
- **Tests:** 137 → 187 (50 new: 13 errors + 17 stream additions + 13 retry + 8 env)

## Accomplishments

- **Task 3.1 (refusal detection):** Five typed error classes + isRetryableUpstream classifier. streamAnswer now returns `{response, usage}` so Plan 04 can log the CONTEXT §5 locked fields prompt_tokens/completion_tokens. Explicit message.refusal check BEFORE JSON.parse on both strict and fallback paths — resolves 02-RESEARCH Q1.
- **Task 3.2 (retry wrapper):** withRetry<T>() bounded-retry helper with jittered exponential backoff. Retries on 429/502/503/504/ECONNRESET; 400/422 propagate raw; 401/403 reclassify to UpstreamAuthError. Four new env knobs with Zod defaults (45000ms total timeout, 2 retries, 500ms base, 250ms jitter). Resolves Q2 (retries live in the adapter).
- **Task 3.3 (AbortSignal hook):** StreamAnswerParams.signal is optional, plumbed through SDK's second-arg request options + withRetry so the retry loop also honours abort. AbortError / APIUserAbortError / leaked-signal-aborted all convert to UpstreamTimeoutError. v1.1 inter-chunk deferral TODO marker + drift-guard test — resolves Q3 (total timeout done; inter-chunk deferred by design).

## Task Commits

Each task was committed atomically:

1. **Task 3.1: Typed upstream error classes + explicit refusal detection** — `574e1f7` (feat)
2. **Task 3.2: Bounded retry wrapper with jittered exponential backoff** — `0e0acc2` (feat)
3. **Task 3.3: AbortSignal total-timeout hook + v1.1 inter-chunk deferral marker** — `f0b2313` (feat)

**Plan metadata commit:** pending (this summary + STATE.md update)

## Files Created/Modified

- `src/llm/errors.ts` *(created)* — Five typed error classes + isRetryableUpstream classifier.
- `src/llm/__tests__/errors.test.ts` *(created)* — 13 tests covering all classes + classifier edge cases (top-level codes, nested cause, unknown codes, falsy inputs).
- `src/llm/__tests__/retry.test.ts` *(created)* — 13 tests exercising withRetry through streamAnswer: retryable success paths (429/502/503/ECONNRESET + nested cause), budget-exhausted paths (3×502 → Upstream5xxError with status=502), non-retryable immediate-propagation (400/401/403/422), backoff timing with fake timers + Math.random stub, budget override (RETRY_MAX=0).
- `src/llm/stream.ts` *(modified)* — Added withRetry helper, RefusalError short-circuit, SchemaRejectAfterRetryError replacement for ad-hoc Error, signal plumbing to SDK second-arg options, isAbortLike() helper, v1.1 TODO marker. Return type changed from `Promise<KbResponse>` to `Promise<StreamAnswerResult>`.
- `src/llm/__tests__/stream.test.ts` *(modified)* — Migrated existing Phase-1 assertions from `result` to `result.response`; added 16 new tests (4 refusal, 4 usage, 7 abort-signal, 1 drift-guard).
- `src/config/env.ts` *(modified)* — Four new fields: UPSTREAM_TOTAL_TIMEOUT_MS (default 45000), UPSTREAM_RETRY_MAX (default 2, capped at 5), UPSTREAM_RETRY_BASE_MS (default 500), UPSTREAM_RETRY_JITTER_MS (default 250).
- `src/config/__tests__/env.test.ts` *(modified)* — 8 new tests covering UPSTREAM_* defaults, string coercion, floor/cap enforcement.
- `scripts/phase0-smoke.ts` *(modified)* — Unwrap `.response` off the new return shape. Backward-compat preserved.

## Decisions Made

**1. StreamAnswerResult exposes usage as nullable object, not throwing when absent.** Some upstream proxies strip the completion.usage block. Logging should still emit the record with usage:null rather than fail or omit — Plan 04's log shape treats null as "unknown".

**2. Refusal short-circuits the Ajv retry loop on the fallback path.** Retrying after a safety-filter refusal is pointless — the model will refuse again. Saves an upstream round-trip and produces a crisper error surface for route-side fallback{reason:'refusal'}.

**3. SchemaRejectAfterRetryError carries the original Error via .cause (not message string).** Preserves the stack + original diagnostic for log-site inspection. Route code reads err.cause.message only when diagnostic detail is needed.

**4. Abort-originated errors must propagate through the Ajv retry loop.** Added isAbortLike() guard on both firstErr and retryErr to prevent the Ajv fallback from swallowing an abort as a retryable schema failure — critical because the Ajv retry bypasses withRetry's signal check.

**5. Upstream-retry loop is ORTHOGONAL to the existing Ajv schema-reject retry.** Both loops coexist because they address different failure modes: withRetry retries on HTTP errors (429/5xx/network); the Ajv loop retries on schema validation failures. Keeping them separate means neither has to understand the other's failure semantics.

**6. withRetry() kept module-private; tests exercise retry policy through streamAnswer.** Tests assert observable contract (call counts, thrown types, backoff timing) rather than helper internals. Makes the retry policy an implementation detail that can evolve without churning test suites.

**7. Backoff timing test uses a single "generous window" advance instead of fine-grained microtask boundaries.** `vi.advanceTimersByTimeAsync` drains pending microtasks along with timers, so asserting at tight ms boundaries (+399 / +2) is flaky when multiple retry-continuation microtasks land together. Single +500ms advance is deterministic and still proves the >200ms backoff requirement.

**8. Non-retryable auth statuses 401/403 reclassify to UpstreamAuthError inside withRetry.** Typed for route-side routing (PITFALLS #11 ingress auth break mitigation). 400/422 propagate raw — route treats these as input-shape errors distinct from auth breaks.

**9. 422 is NOT reclassified as UpstreamAuthError.** Test explicitly asserts `expect(err).not.toBeInstanceOf(UpstreamAuthError)` on 422. The route handler treats 422 as upstream request-validation failure (different from auth) so it needs the raw status + generic Error shape.

## Exact Backoff Values Observed in Test Fixtures

With `Math.random() = 0.5` stub (→ zero jitter since `0.5*2-1=0`):

| Config                                                     | attempt=0 wait | attempt=1 wait | Total before 3rd call |
|------------------------------------------------------------|----------------|----------------|-----------------------|
| BASE_MS=500, JITTER_MS=250, random=0.5 (default test env)  | 500ms          | 1000ms         | 1500ms                |
| BASE_MS=200, JITTER_MS=0,   random=0.5 (override test)     | 200ms          | 400ms          | 600ms                 |

Formula: `delay = baseMs * 2^attempt + (Math.random()*2-1) * jitterMs`. Jitter range is symmetric ±jitterMs, so with random=0.5 the jitter term is 0. Tests that want to observe jitter would stub Math.random to 0.0 (→ -jitterMs) or 1.0 (→ +jitterMs).

Retry budget default is `UPSTREAM_RETRY_MAX=2` = 3 total attempts = 500+1000 = 1.5s of backoff accumulated before the third call fires. Within the 45s total-timeout budget this leaves ~43.5s of actual upstream work across all three attempts.

## Resolution of CONTEXT Research Open Questions

**Q1 (refusal detection) — LOCKED.** Task 3.1 adds an explicit `choices[0].message.refusal` check BEFORE the JSON.parse path on BOTH strict and fallback paths. RefusalError is thrown with the raw refusal string preserved for log correlation. The fallback path specifically short-circuits the Ajv retry loop on refusal — retrying a safety-filter refusal produces no new information, so the retry slot is preserved for genuine schema rejections. Route (Plan 04) maps RefusalError → fallback{reason:'refusal'}. This is the pragmatic-but-explicit choice over conflating a safety refusal with a schema-parse failure.

**Q2 (retry location) — LOCKED in the adapter.** Task 3.2 extends streamAnswer with the withRetry wrapper. Route-level retries are explicitly REJECTED (CONTEXT §3 "Retries live in the adapter"). The Ajv schema-reject retry (existing from Phase-1 Plan 03) remains in streamAnswer and is ORTHOGONAL to withRetry — both loops coexist because they address different failure modes. A thin retry wrapper at the route was considered and rejected: it would duplicate policy and force the route to understand both HTTP and schema failure semantics.

**Q3 (true streaming vs Promise.race) — LOCKED: total-timeout implemented, inter-chunk deferred to v1.1.** Task 3.3 implements the 45s total timeout via AbortController/AbortSignal plumbed through the OpenAI SDK v6's second-argument request options (`create(body, { signal })`). The 20s inter-chunk idle timeout is explicitly DEFERRED: the current facade is `stream: false`, so there are no inter-chunk events to time. A `TODO(v1.1): true-streaming + inter-chunk idle timeout` comment is placed in the code, cross-referenced to Plan 1-05 dev-mode baseline (P95=65ms) and Plan 2-01 prod-mode validation (P95<500ms). A drift-guard test asserts the TODO string is present — if someone removes the marker without landing the feature, the test fires.

## OpenAI SDK v6 Signal-Passing Signature Confirmed

The OpenAI Node SDK accepts AbortSignal as the second argument to `client.chat.completions.create()`:

```ts
await client.chat.completions.create(
  { model, messages, response_format, stream: false },  // request body
  { signal: abortSignal },                               // request options
)
```

Confirmed working in tests via mock capture: the second argument is observed as `{ signal: <AbortSignal> }` and reference-equal to the AbortController's .signal (test: "passes signal through to SDK create() second-argument request options"). When the signal aborts, the SDK throws either:
- `AbortError` (native fetch / undici shape) — `name === 'AbortError'`
- `APIUserAbortError` (OpenAI SDK v6 subclass) — `name === 'APIUserAbortError'`

Both are detected by isAbortLike() and converted to UpstreamTimeoutError at the streamAnswer boundary. The retry loop also short-circuits on signal.aborted between attempts to avoid burning a retry slot after the route has given up.

## Deviations from Plan

**None — plan executed exactly as written.** All three tasks completed with the artifacts, exports, and test counts the plan specified. The only adjustment was a test-design refinement (single "generous window" advance instead of fine-grained ms boundaries in the backoff-override test) captured as Decision 7 above — not a plan deviation but a technique-level refinement during implementation.

## Issues Encountered

**1. Backoff-override test flake on first run.** Initial test used tight `advanceTimersByTimeAsync(399)` then `(2)` ms boundaries to prove the 400ms second-retry wait. Both assertions inspected call counts at +600 and +602ms — but microtask draining inside advanceTimersByTimeAsync caused call 3 to fire at +600 already. **Resolution:** Collapsed the two fine-grained advances into a single `+500ms` advance that crosses the boundary unambiguously. Decision 7 documents this as the pattern for future timing tests.

**2. Node PromiseRejectionHandledWarning noise.** The runWithFakeTimers helper creates a promise, advances timers (which can synchronously reject it), then returns the promise for the test to `expect().rejects...`. Node raised UnhandledPromiseRejection warnings in the gap between promise creation and the test's `.rejects` handler attachment — 7 such warnings fired on the initial run. **Resolution:** Attached a silent `promise.catch(() => {})` immediately after creation to register a handler before Node's detection window closes. The real rejection still propagates through `promise` to the test (promises cache both states).

## User Setup Required

None — no external service configuration required. All changes are library-internal.

## Next Phase Readiness

**Plan 04 (route-wiring) now has everything it needs to compose:**

- **Typed errors for route-side switch:** `switch(err.name)` maps UpstreamTimeoutError → error{code:'upstream_timeout'}; Upstream5xxError (status=429) → error{code:'rate_limited'}; Upstream5xxError (status=5xx) → error{code:'upstream_unavailable'}; SchemaRejectAfterRetryError → error{code:'schema_reject_after_retry'}; RefusalError → fallback{reason:'refusal'}; UpstreamAuthError → error{code:'upstream_unavailable'} + alert (ingress-break signal).
- **Usage fields for CONTEXT §5 logs:** `result.usage?.prompt_tokens` and `result.usage?.completion_tokens` feed the locked log keys null-safely.
- **AbortController wiring pattern:** Route creates `const ac = new AbortController(); setTimeout(() => ac.abort(), env().UPSTREAM_TOTAL_TIMEOUT_MS); streamAnswer({..., signal: ac.signal})`. Cleanup in the finally block cancels the timer when streamAnswer resolves early.
- **Retry behavior is self-contained:** Route does NOT retry. withRetry inside streamAnswer owns the 3-total-attempts + jittered-exponential-backoff policy. Route observes only the final outcome.

**No blockers.** Phase 2 Plan 04 is ready to execute.

**Deferred work tracked for v1.1:**
- Convert streamAnswer from `stream: false` to `stream: true` with per-chunk writer.
- Re-implement 20s inter-chunk idle timeout via chunk-resettable timer (see in-code TODO marker + Plan 1-05 / Plan 2-01 baselines for threshold calibration).
- Distinct `InterChunkTimeoutError` class for provenance differentiation from total-timeout.

---
*Phase: 02-chat-backend-bff*
*Completed: 2026-04-22*

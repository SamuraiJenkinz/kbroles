---
plan: 3
name: upstream-resilience
phase: 2
wave: 2
depends_on: [2]
files_modified:
  - src/llm/stream.ts
  - src/llm/errors.ts
  - src/llm/__tests__/stream.test.ts
  - src/llm/__tests__/errors.test.ts
  - src/llm/__tests__/retry.test.ts
  - src/config/env.ts
  - src/config/__tests__/env.test.ts
autonomous: true

must_haves:
  truths:
    - "streamAnswer() detects completion.choices[0].message.refusal and throws RefusalError when it is a non-null string (answers CONTEXT.md-research open Q#1)"
    - "streamAnswer() return shape is `{response: KbResponse, usage: {prompt_tokens: number, completion_tokens: number} | null}` — usage pulled from completion.usage.{prompt_tokens, completion_tokens} when the OpenAI SDK surfaces it; null when absent. This feeds the CONTEXT.md §5 locked log fields prompt_tokens and completion_tokens that Plan 04 logs."
    - "streamAnswer() wraps the upstream call in a retry loop that retries on upstream 429, 502, 503, 504 and network errors (ECONNRESET, ETIMEDOUT); max 2 retries (3 total attempts); jittered exponential backoff base=500ms, multiplier=2, jitter=±250ms"
    - "Retries do NOT fire on 400, 401, 403, 422, or any error raised after first-byte delivery (per CONTEXT §3 'Retries run BEFORE the first byte is streamed')"
    - "schema_reject_after_retry: when the Phase-1 Ajv fallback path (STRICT_SCHEMA_SUPPORTED=false) also fails after its internal single retry, streamAnswer throws SchemaRejectAfterRetryError — route maps this to error{code:'schema_reject_after_retry'}"
    - "Total timeout: streamAnswer accepts an optional AbortSignal parameter; when the signal aborts, the pending fetch is cancelled and streamAnswer throws UpstreamTimeoutError. Route supplies a signal from an AbortController that fires after 45s (env().UPSTREAM_TOTAL_TIMEOUT_MS, default 45000)"
    - "Inter-chunk 20s idle timeout: NOT implemented in Plan 03 — the current streamAnswer facade is non-streaming (stream: false in Phase-1 stream.ts). Document this as a known gap with a clear deferral comment + test-asserted placeholder; v1.1 refactor converts streamAnswer to true streaming and wires per-chunk resets"
    - "Error classes are typed (discriminated by .name) so the route can switch on them: UpstreamTimeoutError, Upstream5xxError, SchemaRejectAfterRetryError, RefusalError, UpstreamAuthError (non-retry 401/403) — each carries the upstream HTTP status code in .status where applicable"
    - "Retry count + jittered delays observed in tests via a mocked client that returns pre-scripted error responses; backoff uses Math.random for jitter — tests stub Math.random for determinism"
    - "New env vars are zod-validated: UPSTREAM_TOTAL_TIMEOUT_MS (default 45000), UPSTREAM_RETRY_MAX (default 2), UPSTREAM_RETRY_BASE_MS (default 500), UPSTREAM_RETRY_JITTER_MS (default 250)"
    - "Phase-1 smoke script continues to work unchanged (streamAnswer signature extension is backward-compatible — new params are optional with sensible defaults)"
  artifacts:
    - path: "src/llm/errors.ts"
      provides: "Typed error classes + isRetryableUpstream(err) classifier"
      exports: ["UpstreamTimeoutError", "Upstream5xxError", "SchemaRejectAfterRetryError", "RefusalError", "UpstreamAuthError", "isRetryableUpstream"]
    - path: "src/llm/stream.ts"
      provides: "streamAnswer extended with refusal detection, retry wrapper, AbortSignal support; return shape is {response: KbResponse, usage: {prompt_tokens, completion_tokens} | null}"
      exports: ["streamAnswer", "StreamAnswerParams", "StreamAnswerResult"]
  key_links:
    - from: "src/llm/stream.ts"
      to: "src/llm/errors.ts"
      via: "throws typed errors from errors.ts so route can discriminate"
      pattern: "throw new (UpstreamTimeoutError|Upstream5xxError|SchemaRejectAfterRetryError|RefusalError|UpstreamAuthError)"
    - from: "src/llm/stream.ts"
      to: "OpenAI SDK"
      via: "completion.choices[0]?.message?.refusal explicit check before JSON.parse(content)"
      pattern: "message\\.refusal"
    - from: "src/llm/stream.ts"
      to: "src/config/env.ts"
      via: "reads UPSTREAM_TOTAL_TIMEOUT_MS + UPSTREAM_RETRY_* for timeout + retry config"
      pattern: "UPSTREAM_RETRY_MAX|UPSTREAM_TOTAL_TIMEOUT_MS"
---

<objective>
Extend the Phase-1 `streamAnswer()` facade with the resilience features CONTEXT.md §3 locks: explicit refusal detection, bounded retries on upstream 429/502/503/504 + network errors, and an AbortSignal-driven total-timeout hook. All resilience logic lives INSIDE streamAnswer (CONTEXT §1 "Retries live in the adapter, NOT the route"). The route in Plan 04 calls streamAnswer and catches typed errors — it never reshapes retry logic.

Purpose: resolves the three open questions from CONTEXT.md §Research (research open questions 1, 2, 3) — each has its own task in this plan. The plan is deliberately bounded: it extends the Phase-1 surface, does not rewrite it. The smoke script and existing tests must continue to pass.

Output: new `src/llm/errors.ts` typed-error module; `src/llm/stream.ts` upgraded with retry + timeout + refusal detection; env schema extended with four new vars; three test files covering all paths.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Depends on Plan 02 only through shared env.ts schema (if Plan 02 has already extended env, Plan 03 extends further in Task 3.3; if not, Plan 03 defines its own additions — env.ts is additive-only across plans).

Before starting, read:

@.planning/phases/02-chat-backend-bff/02-CONTEXT.md  (§3 Upstream resilience & rate limiting — AUTHORITATIVE for retry/backoff/timeout policy)
@.planning/phases/02-chat-backend-bff/02-RESEARCH.md  (§OpenAI SDK v6 Refusal Detection — MEDIUM-confidence open question resolved here; §Open Questions #1 and #2 and #3 — all three resolved in this plan)
@.planning/research/PITFALLS.md  (#12 429 handling — retry/backoff/jitter spec; #10 APIM buffering — inter-chunk timeout context; #11 ingress auth break)
@src/llm/stream.ts  (existing Phase-1 facade — extend, do NOT rewrite)
@src/llm/client.ts  (createLlmClient — unchanged in Plan 03)
@src/grounding/schema.ts  (KbResponse — return type unchanged)
@src/config/env.ts  (env schema — extend with retry + timeout vars)
@scripts/phase0-smoke.ts  (ensure continued green after extension)

**Backward-compatibility constraint:** Phase-1 smoke runs `streamAnswer({client, systemPrompt, messages})` — with no signal, no retry override. After this plan, that call must still succeed with the default retry/timeout config. Add new parameters as OPTIONAL with sensible env-driven defaults.

**Open questions resolved in this plan:**
- **Q1 (refusal detection):** Task 3.1 adds an explicit `choices[0].message.refusal` check BEFORE the JSON.parse path. RefusalError is thrown; route maps to `fallback{reason:'refusal'}`. This is the pragmatic-but-explicit choice — we don't conflate a safety-filter refusal with a schema-parse failure.
- **Q2 (retry location):** Task 3.2 extends streamAnswer with the retry wrapper. Route-level retries are explicitly REJECTED (CONTEXT §3 "Retries live in the adapter"). A thin wrapper at the route was considered but rejected: it would duplicate policy between streamAnswer (which has its own json_schema→json_object fallback retry) and the route.
- **Q3 (true streaming vs Promise.race):** Task 3.3 implements the 45s total timeout via AbortController/Promise.race. The 20s inter-chunk idle timeout is explicitly DEFERRED — the current facade is `stream:false`, so there are no inter-chunk events to time. A `// TODO(v1.1): true streaming — restore 20s inter-chunk timer` comment is placed in the code, and a test asserts the deferral is documented (not forgotten).

**Env schema additions for this plan** (add to `src/config/env.ts` EnvSchema, z.coerce.number().int() pattern matching Plan 02):
```ts
UPSTREAM_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(1000).optional().default(45000),
UPSTREAM_RETRY_MAX:        z.coerce.number().int().min(0).max(5).optional().default(2),
UPSTREAM_RETRY_BASE_MS:    z.coerce.number().int().min(100).optional().default(500),
UPSTREAM_RETRY_JITTER_MS:  z.coerce.number().int().min(0).optional().default(250),
```
</context>

<tasks>

<task id="3.1" type="auto">
  <name>Task 3.1: Typed errors module + explicit refusal detection</name>
  <files>src/llm/errors.ts, src/llm/stream.ts, src/llm/__tests__/errors.test.ts, src/llm/__tests__/stream.test.ts</files>
  <action>
    1. Create `src/llm/errors.ts` exporting five named error classes and one classifier helper:

       ```ts
       export class UpstreamTimeoutError extends Error {
         readonly name = 'UpstreamTimeoutError' as const
         constructor(message = 'Upstream timed out') { super(message) }
       }
       export class Upstream5xxError extends Error {
         readonly name = 'Upstream5xxError' as const
         constructor(readonly status: number, message?: string) { super(message ?? `Upstream ${status}`) }
       }
       export class SchemaRejectAfterRetryError extends Error {
         readonly name = 'SchemaRejectAfterRetryError' as const
         constructor(readonly cause?: unknown) { super('Schema rejected after retry') }
       }
       export class RefusalError extends Error {
         readonly name = 'RefusalError' as const
         constructor(readonly refusal: string) { super(`Model refused: ${refusal.slice(0, 80)}`) }
       }
       export class UpstreamAuthError extends Error {
         readonly name = 'UpstreamAuthError' as const
         constructor(readonly status: 401 | 403) { super(`Upstream auth ${status}`) }
       }

       /**
        * Classify an error as retryable per CONTEXT.md §3.
        * Retryable: 429, 502, 503, 504, network (ECONNRESET, ETIMEDOUT).
        * NOT retryable: 400, 401, 403, 422, or any other path.
        * The OpenAI SDK surfaces HTTP errors as `error.status` on APIError subclasses.
        */
       export function isRetryableUpstream(err: unknown): boolean {
         if (!err || typeof err !== 'object') return false
         const e = err as { status?: number; code?: string; name?: string }
         if (typeof e.status === 'number') {
           return e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504
         }
         // Network-level errors (fetch undici): name === 'FetchError' with code nested.
         const code = e.code ?? (e as { cause?: { code?: string } }).cause?.code
         if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'UND_ERR_SOCKET') return true
         return false
       }
       ```

    2. Create `src/llm/__tests__/errors.test.ts` — tests for each class (name discriminator + payload):
       - `new UpstreamTimeoutError().name === 'UpstreamTimeoutError'`.
       - `new Upstream5xxError(502).status === 502`.
       - `new RefusalError('policy').refusal === 'policy'`.
       - `isRetryableUpstream({status: 429})` → true; 502 → true; 503 → true; 504 → true.
       - `isRetryableUpstream({status: 400})` → false; 401 → false; 422 → false.
       - `isRetryableUpstream({code: 'ECONNRESET'})` → true.
       - `isRetryableUpstream({cause: {code: 'ECONNRESET'}})` → true.
       - `isRetryableUpstream(null)` / `undefined` / `{}` → false.

    3. Modify `src/llm/stream.ts` — add refusal detection BEFORE JSON.parse (both strict and fallback paths) AND reshape the return value to surface token usage:

       New return type (export alongside StreamAnswerParams):
       ```ts
       export interface StreamAnswerResult {
         response: KbResponse
         /** OpenAI completion.usage when present; null when SDK/upstream omits it.
          *  Plan 04 logs prompt_tokens + completion_tokens per CONTEXT.md §5. */
         usage: { prompt_tokens: number; completion_tokens: number } | null
       }
       ```

       Usage extraction helper (module-private):
       ```ts
       function extractUsage(completion: unknown): StreamAnswerResult['usage'] {
         const u = (completion as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage
         if (!u || typeof u.prompt_tokens !== 'number' || typeof u.completion_tokens !== 'number') return null
         return { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens }
       }
       ```

       Strict path (AFTER the create() call):
       ```ts
       const msg = completion.choices[0]?.message
       if (msg?.refusal) throw new RefusalError(msg.refusal)
       const content = msg?.content ?? '{}'
       return { response: JSON.parse(content) as KbResponse, usage: extractUsage(completion) }
       ```

       Fallback path (tryOnce):
       ```ts
       const msg = completion.choices[0]?.message
       if (msg?.refusal) throw new RefusalError(msg.refusal)
       const content = msg?.content ?? '{}'
       const parsed = JSON.parse(content)
       // ... existing Ajv validation unchanged; on success:
       return { response: parsed as KbResponse, usage: extractUsage(completion) }
       ```

       Update `streamAnswer`'s return type from `Promise<KbResponse>` to `Promise<StreamAnswerResult>`. The Phase-1 smoke script + any Phase-1 callers must be updated in this same task to read `.response` off the return value (backward-compat is preserved by the new shape being a superset — the additional `.usage` field is purely additive).

       Also update the final catch in the fallback path: when BOTH tryOnce attempts fail, throw `new SchemaRejectAfterRetryError(retryErr)` instead of the current ad-hoc `Error('streamAnswer json_object fallback failed twice: ...')`. Preserve the message text inside .cause for diagnostic continuity.

       Import from errors.ts at the top of stream.ts.

    4. Extend `src/llm/__tests__/stream.test.ts` (existing Phase-1 file — additive tests, don't rewrite):
       - Test: strict path, mock client returns `{choices: [{message: {refusal: 'policy violation'}}]}` → streamAnswer throws RefusalError with .refusal === 'policy violation'.
       - Test: fallback path (strictSchemaSupported=false), mock returns refusal → RefusalError.
       - Test: fallback path, both tryOnce() attempts produce invalid JSON → throws SchemaRejectAfterRetryError (NOT the old generic Error).
       - Test: strict path, mock returns `{choices:[{message:{content:'{"can_answer":true,...}'}}], usage:{prompt_tokens:123, completion_tokens:45}}` → result.usage === `{prompt_tokens:123, completion_tokens:45}`.
       - Test: strict path, mock omits `usage` → result.usage === null.
       - Test: strict path, mock `usage` has non-number fields → result.usage === null.
       - Test: fallback path success also surfaces usage identically (same extractUsage helper).
       - Existing Phase-1 tests must be updated to read `result.response` instead of `result` directly — include this migration in the same commit.

    5. Commit: `feat(phase-2/plan-03): add typed upstream error classes + explicit refusal detection`.
  </action>
  <verify>
    `pnpm typecheck` passes. `pnpm test` passes with ≥8 new error-class tests + ≥3 new stream refusal tests. Existing Phase-1 stream tests still green.
  </verify>
  <done>
    Five error classes exported with discriminated .name; isRetryableUpstream classifier correctly handles 429/5xx + ECONNRESET; streamAnswer throws RefusalError when the SDK surfaces a refusal; SchemaRejectAfterRetryError replaces the generic error in the fallback-twice-failed path.
  </done>
</task>

<task id="3.2" type="auto">
  <name>Task 3.2: Bounded retry wrapper with jittered exponential backoff</name>
  <files>src/llm/stream.ts, src/llm/__tests__/retry.test.ts, src/config/env.ts</files>
  <action>
    1. Extend `src/config/env.ts` EnvSchema with the four new UPSTREAM_* fields from `<context>` above (if Plan 02 did not already add them — this plan assumes additive env extensions are safe). Use `z.coerce.number().int()` pattern.

       **Env test coverage (add to `src/config/__tests__/env.test.ts`):** add assertions covering the four new defaults when env vars are absent:
       - `UPSTREAM_TOTAL_TIMEOUT_MS === 45000`
       - `UPSTREAM_RETRY_MAX === 2`
       - `UPSTREAM_RETRY_BASE_MS === 500`
       - `UPSTREAM_RETRY_JITTER_MS === 250`
       Also assert one coercion case (e.g., `UPSTREAM_TOTAL_TIMEOUT_MS="60000"` string env → parsed as number 60000). Use `__resetEnvCacheForTests()` between cases. If Plan 02 already created this test file, append; if not, create it (Plan 02 also writes to it so coordinate — either plan's test arrives at a superset).

    2. Modify `src/llm/stream.ts` — wrap the upstream call with a retry loop:

       ```ts
       import { isRetryableUpstream, Upstream5xxError, UpstreamAuthError } from '@/llm/errors'

       /**
        * Execute fn with bounded retries on retryable upstream errors.
        * CONTEXT.md §3: retry on 429/502/503/504/ECONNRESET; cap at UPSTREAM_RETRY_MAX
        * (default 2 = 3 total attempts); jittered exponential backoff.
        * Non-retryable errors (400, 401, 403, 422, RefusalError, SchemaRejectAfterRetry)
        * propagate immediately.
        */
       async function withRetry<T>(
         fn: () => Promise<T>,
         cfg: { max: number; baseMs: number; jitterMs: number }
       ): Promise<T> {
         let lastErr: unknown
         for (let attempt = 0; attempt <= cfg.max; attempt++) {
           try {
             return await fn()
           } catch (err) {
             lastErr = err
             // Map auth failures to typed errors, still non-retryable.
             const status = (err as { status?: number })?.status
             if (status === 401 || status === 403) throw new UpstreamAuthError(status)
             if (!isRetryableUpstream(err)) throw err
             if (attempt === cfg.max) break
             const delay = cfg.baseMs * Math.pow(2, attempt) + (Math.random() * 2 - 1) * cfg.jitterMs
             await new Promise(r => setTimeout(r, Math.max(0, delay)))
           }
         }
         // Exhausted retries on a retryable error — surface as Upstream5xxError (or rethrow original)
         const s = (lastErr as { status?: number })?.status ?? 0
         if (s >= 500 || s === 429) throw new Upstream5xxError(s, `Retries exhausted (last status ${s})`)
         throw lastErr
       }
       ```

    3. In streamAnswer, wrap the `client.chat.completions.create(...)` call sites in `withRetry(() => client...., retryCfg)`. Both the strict path and the fallback path (tryOnce) get wrapped — though note tryOnce already has its own "retry once on Ajv fail" logic, and that is ORTHOGONAL to upstream retries (it retries on schema rejection, not HTTP errors; keep both loops — they do different things). withRetry's generic `<T>` parameter is now `{response, usage}` — the call-site shape is unchanged because withRetry is transparent to the inner type.

       Read retry config from env() at call time:
       ```ts
       const retryCfg = {
         max: e.UPSTREAM_RETRY_MAX,
         baseMs: e.UPSTREAM_RETRY_BASE_MS,
         jitterMs: e.UPSTREAM_RETRY_JITTER_MS,
       }
       ```

    4. Create `src/llm/__tests__/retry.test.ts` — drive the retry loop with a mocked `create()` that returns pre-scripted failures:
       - Retries on 429 exactly twice, succeeds on third attempt → returns `{response: KbResponse, usage}` (observe via call count; assert `.response.can_answer` + `.usage` shape).
       - Retries on 502 twice, third attempt also 502 → throws Upstream5xxError with .status === 502.
       - Non-retryable 400 → throws immediately on first attempt (create called exactly once).
       - Non-retryable 401 → throws UpstreamAuthError(401) immediately.
       - Non-retryable 403 → throws UpstreamAuthError(403).
       - ECONNRESET (thrown as `{code:'ECONNRESET'}`) → retried; mix 1 ECONNRESET + success works in 2 attempts.
       - Backoff timing: stub Math.random to a fixed 0.5; assert the setTimeout delays observed between attempts are `baseMs*2^attempt + 0*jitterMs = baseMs*2^attempt` (i.e., zero jitter at random=0.5 since (0.5*2-1)=0). Use vitest fake timers (`vi.useFakeTimers()` + `vi.advanceTimersByTime`).
       - Retry count of 0: UPSTREAM_RETRY_MAX override to 0 → no retries; first failure propagates immediately.

       Use the same "plain-object mock client" pattern from Phase-1 Plan 03 decision log (STATE.md §Plan 03 decisions).

    5. Commit: `feat(phase-2/plan-03): add bounded retry wrapper with jittered exponential backoff`.
  </action>
  <verify>
    `pnpm typecheck` passes. `pnpm test` passes with ≥8 new retry tests + 4 new env default assertions + 1 coercion case; existing stream tests green. Fake-timer assertions verify both backoff spacing and attempt counts. `grep -q "UPSTREAM_TOTAL_TIMEOUT_MS" src/config/__tests__/env.test.ts` returns 0.
  </verify>
  <done>
    withRetry() retries on 429/502/503/504/ECONNRESET exactly UPSTREAM_RETRY_MAX times; 400/401/403 propagate immediately (with 401/403 as UpstreamAuthError); backoff uses Math.random for jitter; existing Phase-1 streamAnswer tests still pass unchanged (backward-compat confirmed).
  </done>
</task>

<task id="3.3" type="auto">
  <name>Task 3.3: Total-timeout AbortSignal hook + inter-chunk deferral documented</name>
  <files>src/llm/stream.ts, src/llm/__tests__/stream.test.ts</files>
  <action>
    1. Extend `StreamAnswerParams` in `src/llm/stream.ts` with an optional `signal?: AbortSignal`:

       ```ts
       export interface StreamAnswerParams {
         client: OpenAI
         systemPrompt: string
         messages: ChatMessage[]
         strictSchemaSupported?: boolean
         /**
          * Optional AbortSignal propagated to the upstream fetch.
          * Route supplies this from an AbortController that fires after
          * env().UPSTREAM_TOTAL_TIMEOUT_MS (default 45000) per CONTEXT.md §3.
          * When the signal aborts, throws UpstreamTimeoutError.
          *
          * INTER-CHUNK (20s idle between successive stream chunks): NOT implemented
          * in Phase 2. The current streamAnswer uses stream: false, so there are
          * no inter-chunk events to time. See // TODO(v1.1) comment below.
          */
         signal?: AbortSignal
       }
       ```

    2. Pass `signal` through to the OpenAI SDK call via the SDK's second-argument options:

       ```ts
       const completion = await client.chat.completions.create(
         { model: e.LLM_MODEL, messages: wireMessages, response_format: {...}, stream: false },
         { signal: params.signal }
       )
       ```

       Apply to BOTH the strict path and the fallback-path tryOnce. The OpenAI Node SDK accepts `{ signal }` in request options (confirmed in openai@6 docs).

       Handle the abort → UpstreamTimeoutError conversion in withRetry:
       ```ts
       } catch (err) {
         if ((err as { name?: string })?.name === 'AbortError' || params.signal?.aborted) {
           throw new UpstreamTimeoutError()
         }
         // ... existing error handling
       }
       ```
       An aborted signal should NOT be retried — check `signal.aborted` before each retry loop iteration and short-circuit.

    3. Add the TODO comment block documenting the inter-chunk deferral. This is the v1.1 upgrade path — it must be visible in the code so it isn't lost:

       ```ts
       // TODO(v1.1): true-streaming + inter-chunk idle timeout.
       // CONTEXT.md §3 locks a 20s inter-chunk timeout for Pitfall #10 (MGTI APIM
       // buffering). It is NOT implemented here because the current facade uses
       // stream: false — there is no chunk sequence to time. When streamAnswer is
       // refactored to `stream: true` (v1.1 or whenever first-byte latency becomes
       // user-visible), add an inter-chunk timer that resets on each chunk and
       // fires controller.abort() with a distinct InterChunkTimeoutError so the
       // route can emit error{code:'upstream_timeout'} with the right provenance.
       //
       // Observed Phase-0 baseline (Plan 1-05): dev-mode P95 inter-chunk=65ms over
       // 195 chunks. Prod-mode Smoke 3 (Plan 2-01 Task 1.1) calibrates the true
       // threshold before v1.1 wires it.
       ```

    4. Extend `src/llm/__tests__/stream.test.ts`:
       - Test: signal already-aborted → streamAnswer throws UpstreamTimeoutError without calling client.chat.completions.create. Verify call count === 0.
       - Test: signal aborts mid-request — mock `create()` rejects with `{name:'AbortError'}` → throws UpstreamTimeoutError.
       - Test: no signal supplied (Phase-1 backward compat) → happy path returns KbResponse; create() called exactly once.
       - Documentation-drift guard: grep test asserts the string `TODO(v1.1): true-streaming + inter-chunk` exists in src/llm/stream.ts. If someone removes the TODO without landing the actual feature, this test fires. One line: `expect(readFileSync('src/llm/stream.ts','utf-8')).toContain('TODO(v1.1): true-streaming + inter-chunk')`.

    5. Commit: `feat(phase-2/plan-03): add AbortSignal total-timeout hook + v1.1 inter-chunk deferral marker`.
  </action>
  <verify>
    `pnpm typecheck` passes. `pnpm test` green; ≥4 new stream-signal tests pass; documentation-drift test catches missing TODO. Phase-1 smoke script `pnpm smoke -- --mode=dev` continues to succeed (backward-compat sanity check — streamAnswer still callable with no signal).
  </verify>
  <done>
    StreamAnswerParams.signal is optional + plumbed to SDK create({signal}); signal.aborted → UpstreamTimeoutError; retry loop honours signal; inter-chunk deferral is documented with a TODO + drift-guard test + cross-reference to Plan 1-05 baseline.
  </done>
</task>

</tasks>

<verification>
  - `pnpm typecheck` clean.
  - `pnpm test` green: existing Phase-1 tests (70+) + new errors.test (~8) + retry.test (~8) + stream.test additions (~7) = ≥95 total.
  - `pnpm smoke -- --mode=dev` continues to PASS (backward-compat).
  - `src/llm/errors.ts` exports the five error classes + isRetryableUpstream.
  - `src/llm/stream.ts` contains `isRetryableUpstream`, `withRetry`, explicit refusal check before JSON.parse, and the TODO(v1.1) marker.
  - `src/config/env.ts` contains four new UPSTREAM_* fields with zod defaults.
  - No route code written in this plan — route handler lives in Plan 04.
</verification>

<success_criteria>
Phase 2 SC #1 ("streaming answer tokens" in the happy path): not directly achieved here — Plan 04 does the SSE streaming. Plan 03 ensures the upstream call is resilient enough that streaming actually begins.

Phase 2 SC #2 ("single fallback event"): RefusalError contributes one of the four fallback reasons; route in Plan 04 maps it to `fallback{reason:'refusal'}`.

Phase 2 Pitfall focus: Pitfall 11 (ingress auth break — UpstreamAuthError catches 401/403); Pitfall 12 (429 handling + exponential backoff — withRetry implements the policy CONTEXT §3 locks).
</success_criteria>

<output>
After completion, create `.planning/phases/02-chat-backend-bff/02-03-SUMMARY.md`. Capture:
- Exact backoff values observed in test fixtures (for reproducibility)
- Resolution of CONTEXT research open Q1 (refusal via explicit check — locked here)
- Resolution of Q2 (retries in adapter — locked here)
- Resolution of Q3 (total timeout implemented, inter-chunk deferred — locked as v1.1 TODO)
- OpenAI SDK v6 signal-passing signature confirmed (request-options second arg)
</output>

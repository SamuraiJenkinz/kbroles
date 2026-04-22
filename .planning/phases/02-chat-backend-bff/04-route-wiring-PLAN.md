---
plan: 4
name: route-wiring
phase: 2
wave: 3
depends_on: [1, 2, 3]
files_modified:
  - src/app/api/chat/route.ts
  - src/app/api/prompts/route.ts
  - src/app/api/chat/__tests__/route.test.ts
  - src/app/api/prompts/__tests__/route.test.ts
  - docs/api-chat-contract.md
autonomous: true

must_haves:
  truths:
    - "POST /api/chat runs in Node runtime (export const runtime = 'nodejs', export const dynamic = 'force-dynamic')"
    - "Happy path: curl with a valid {role, messages} body emits N answer_delta frames, then one citations frame, then one done frame; Content-Type is text/event-stream; charset=utf-8"
    - "Response headers include Cache-Control: no-cache, no-transform; Connection: keep-alive; X-Accel-Buffering: no; X-Request-Id: <uuid>"
    - "Fallback path (can_answer=false): POST emits zero or more answer_delta frames then one fallback{reason:'can_answer_false', text:FALLBACK_STRING} frame; no citations, no done"
    - "Fallback path (all_citations_stripped): validator strips every citation → fallback{reason:'all_citations_stripped', text:FALLBACK_STRING}"
    - "Fallback path (allowlist_violation): checkEntityAllowlist returns passed=false → fallback{reason:'allowlist_violation', text:FALLBACK_STRING}; log records {class, token_count}; violating token NOT in the log"
    - "Fallback path (refusal): streamAnswer throws RefusalError → fallback{reason:'refusal', text:FALLBACK_STRING}"
    - "Error paths: UpstreamTimeoutError → error{code:'upstream_timeout'}; Upstream5xxError → error{code:'upstream_5xx'}; SchemaRejectAfterRetryError → error{code:'schema_reject_after_retry'}; unknown → error{code:'internal'}"
    - "Request validation: parseChatRequest errors return HTTP 400/413 (history_cap_exceeded / message_too_long are 413) with JSON body {error:<code>} and NO SSE stream opened"
    - "Concurrency: chatSemaphore.tryAcquire() fails → HTTP 429 with Retry-After:5 header + JSON body; semaphore is always released in a finally block, even on abort"
    - "Client disconnect: request.signal.addEventListener('abort', ...) aborts the upstream AbortController; the route's background IIFE exits cleanly without ResponseAborted unhandled rejections"
    - "Structured log on every request contains the CONTEXT §5 locked fields: request_id, role, host, validator_flips, refusal_fired, fallback_reason (or null), ingress_status_code, prompt_tokens, completion_tokens (both pulled from streamAnswer's StreamAnswerResult.usage; logged as numbers on the happy/fallback paths when upstream surfaced usage; null when usage absent or streamAnswer threw before delivering a response), latency_ms; no raw question text, no answer text, no quote text, no offending token"
    - "answer_delta is emitted ONLY on the grounded-happy-path branch (response.can_answer === true AND validator did not strip everything AND allowlist passed). All fallback paths (can_answer_false, all_citations_stripped, allowlist_violation, refusal) suppress answer_delta entirely and emit only the fallback event — this prevents ungrounded model text from leaking to the client (Pitfall 5: server refuses to re-narrate workarounds)"
    - "chatSemaphore.release() is guaranteed on every exit path (validation failure, auth failure, streaming success, streaming error, client disconnect) by wrapping the full POST body after tryAcquire() in try { ... } finally { chatSemaphore.release() }; starvation regression test asserts post-400-response tryAcquire() immediately succeeds"
    - "GET /api/prompts?role=consumer returns {role:'consumer', prompts:SUGGESTED_PROMPTS.consumer}; ?role=author returns 8 chips; Cache-Control: public, max-age=3600, stale-while-revalidate=86400"
    - "GET /api/prompts without role param → 400 {error:'role_required', allowed:['consumer','author']}; unknown role → 400 {error:'role_invalid', allowed:['consumer','author']}"
    - "docs/api-chat-contract.md documents the full SSE event schema, event ordering on happy/fallback/error paths, client reconciliation rules, and a TypeScript reference consumer snippet for Phase-3 authors"
  artifacts:
    - path: "src/app/api/chat/route.ts"
      provides: "POST handler: request validation, semaphore, auth stub, composeSystemPrompt, streamAnswer (with signal), partial-JSON stream, validator, allowlist, SSE emission, structured log"
      exports: ["POST", "runtime", "dynamic"]
      min_lines: 120
    - path: "src/app/api/prompts/route.ts"
      provides: "GET handler: ?role query validation + chip lookup + Cache-Control"
      exports: ["GET"]
    - path: "docs/api-chat-contract.md"
      provides: "Client-facing SSE contract for Phase 3 consumers; includes reference TS snippet"
      min_lines: 80
  key_links:
    - from: "src/app/api/chat/route.ts"
      to: "src/llm/stream.ts"
      via: "calls streamAnswer({client, systemPrompt, messages, signal}) → destructures {response, usage}; usage feeds prompt_tokens/completion_tokens log fields; catches RefusalError/UpstreamTimeoutError/Upstream5xxError/SchemaRejectAfterRetryError/UpstreamAuthError"
      pattern: "streamAnswer"
    - from: "src/app/api/chat/route.ts"
      to: "src/grounding/systemPrompt.ts"
      via: "composeSystemPrompt(role) — role from validated request"
      pattern: "composeSystemPrompt"
    - from: "src/app/api/chat/route.ts"
      to: "src/grounding/validator.ts"
      via: "validateCitations(response, REGISTRY); result._flips counted into validator_flips log field"
      pattern: "validateCitations"
    - from: "src/app/api/chat/route.ts"
      to: "src/chat/allowlist.ts"
      via: "checkEntityAllowlist(result.answer) runs AFTER validator; violation → fallback{reason:'allowlist_violation'}"
      pattern: "checkEntityAllowlist"
    - from: "src/app/api/chat/route.ts"
      to: "src/chat/sse.ts"
      via: "encodeSse(event) for every frame written to the TransformStream writer"
      pattern: "encodeSse"
    - from: "src/app/api/chat/route.ts"
      to: "src/chat/partialAnswer.ts"
      via: "makeAnswerTracker() emits answer_delta frames. Note: with stream:false (Phase-1 facade), the full answer arrives at once and ONE answer_delta is emitted with the full text. v1.1 refactor to stream:true makes this truly incremental."
      pattern: "makeAnswerTracker"
    - from: "src/app/api/chat/route.ts"
      to: "src/chat/concurrency.ts"
      via: "chatSemaphore.tryAcquire() at entry; chatSemaphore.release() in finally"
      pattern: "chatSemaphore\\.(tryAcquire|release)"
    - from: "src/app/api/chat/route.ts"
      to: "src/app/api/_middleware.ts"
      via: "getRequestUser(request) for the stub-auth gate"
      pattern: "getRequestUser"
    - from: "src/app/api/chat/route.ts"
      to: "src/obs/logger.ts"
      via: "requestLogger({request_id, role, host}) — child logger carries the fields through the request"
      pattern: "requestLogger"
    - from: "src/app/api/prompts/route.ts"
      to: "src/prompts/suggested.ts"
      via: "SUGGESTED_PROMPTS[role] — returns the 5 Consumer or 8 Author chips"
      pattern: "SUGGESTED_PROMPTS"
---

<objective>
Wire the Phase-2 route handlers: `POST /api/chat` orchestrates the full SSE pipeline (request validation → auth stub → semaphore → composeSystemPrompt → streamAnswer with abort signal → partial-JSON answer_delta emission → citation validator → allowlist post-check → terminal citations+done OR fallback OR error) and writes a structured log. `GET /api/prompts` serves the chip list. Docs/api-chat-contract.md is the Phase-3 hand-off.

Purpose: achieves all five Phase 2 Success Criteria by composing the primitives from Plans 01/02/03 into the first real user-facing surface. This is the integration plan — most of the logic is already tested in isolation; the route's job is orchestration.

Output: two route handlers + two route-level test suites + one client-contract doc.

**Entry gate:** Task 4.2 (chat route code) is BLOCKED until Plan 01 Task 1.1 prod-smoke resume-signal is `prod-smoke-green`. If prod-smoke is still `blocked: no-mgti-access`, Tasks 4.1 (prompts route — safe to write, no upstream call) and 4.3 (contract doc — pure docs) CAN proceed; Task 4.2 waits. CONTEXT.md §Entry Gates. The plan marks this explicitly at the top of Task 4.2.
</objective>

<execution_context>
@C:\Users\taylo\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\taylo\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Depends on: Plan 01 (logger, auth stub, pino config), Plan 02 (SSE types, partial-JSON parser, allowlist, semaphore, request schema, chips), Plan 03 (streamAnswer retry/timeout/refusal, typed errors).

Before starting, read:

@.planning/phases/02-chat-backend-bff/02-CONTEXT.md  (§1 SSE event ordering, §2 allowlist sequence, §3 semaphore/429 behaviour, §4 HTTP contract, §5 log fields — all AUTHORITATIVE)
@.planning/phases/02-chat-backend-bff/02-RESEARCH.md  (§Pattern 1 TransformStream writer, §Pattern 2 request.signal disconnect, §Pattern 3 runtime/dynamic exports, §Vitest Route-Level Testing Pattern)
@.planning/research/ARCHITECTURE.md  (§5 streaming route sketch, §7 citation-hold semantics, §12 Pattern 4 thin-BFF)
@.planning/research/PITFALLS.md  (#2 validator is deterministic guard, #5 server refuses workaround, #6 allowlist, #7 injection resistance, #10 APIM buffering, #12 throttle)

# Plans depended on (for types + artifact shapes):
@.planning/phases/02-chat-backend-bff/02-01-SUMMARY.md  (logger fields, middleware contract, prod-smoke status — READ FIRST to confirm Task 4.2 gate)
@.planning/phases/02-chat-backend-bff/02-02-SUMMARY.md  (SUGGESTED_PROMPTS shape, SSE event schema, parseChatRequest result discriminator)
@.planning/phases/02-chat-backend-bff/02-03-SUMMARY.md  (streamAnswer signature with signal, typed error classes)

@src/chat/sse.ts              (SseEvent, encodeSse)
@src/chat/partialAnswer.ts    (makeAnswerTracker)
@src/chat/allowlist.ts        (checkEntityAllowlist)
@src/chat/concurrency.ts      (chatSemaphore)
@src/chat/requestSchema.ts    (parseChatRequest, error codes)
@src/prompts/suggested.ts     (SUGGESTED_PROMPTS)
@src/obs/logger.ts            (requestLogger)
@src/app/api/_middleware.ts   (getRequestUser)
@src/llm/stream.ts            (streamAnswer with signal)
@src/llm/errors.ts            (typed error classes)
@src/llm/client.ts            (createLlmClient)
@src/grounding/systemPrompt.ts  (composeSystemPrompt)
@src/grounding/validator.ts   (validateCitations)
@src/grounding/registry.ts    (REGISTRY)
@src/grounding/fallback.ts    (FALLBACK_STRING — the text fallback events carry)

**Route pipeline (LOCKED — CONTEXT.md §1, §2, §3, §4, §5):**

```
POST /api/chat
├─ request_id = crypto.randomUUID()
├─ started = Date.now()
├─ log = requestLogger({request_id, host: 'web'})
├─ if (!chatSemaphore.tryAcquire()) → 429 {error:'rate_limited', Retry-After:5}
│
│  // CRITICAL (Issue #3 fix — semaphore-leak safety): after tryAcquire succeeds,
│  // EVERY exit path below must release the semaphore. The cleanest enforcement
│  // is a single try/finally that wraps the entire remainder of the handler.
│  // Pre-stream validation/auth early-return paths (400, 413, 401, 500) and the
│  // background-IIFE success path both pass through this finally.
│
├─ try {
│    // --- Pre-stream section (may early-return 4xx/5xx JSON; semaphore still
│    //     releases via outer finally) ---
│    let body: unknown
│    try { body = await request.json() }
│    catch { return Response.json({error:'messages_missing'}, {status: 400}) }
│
│    const parsed = parseChatRequest(body)
│    if (!parsed.ok) {
│      const status = mapParseErrorToStatus(parsed.code)   // 400 or 413
│      return Response.json({error: parsed.code}, {status})
│    }
│
│    const user = getRequestUser(request)
│    if (user.error) return Response.json({error:'unauthorized'}, {status: 401})
│
│    log = log.child({role: parsed.data.role})
│    const systemPrompt = composeSystemPrompt(parsed.data.role)
│    const client = createLlmClient()
│    const totalTimeoutMs = env().UPSTREAM_TOTAL_TIMEOUT_MS
│    const controller = new AbortController()
│    const totalTimer = setTimeout(() => controller.abort(), totalTimeoutMs)
│    const onClientAbort = () => controller.abort()
│    request.signal.addEventListener('abort', onClientAbort)
│
│    // --- Streaming section ---
│    // The background IIFE owns releasing the semaphore ONLY for the streaming
│    // happy/fallback/error paths it executes. The pre-stream early-returns
│    // above do NOT reach this point, so their semaphore release happens via
│    // the outer finally (see below). To prevent double-release, we set a
│    // `streamingStarted` flag after the writer is dispatched; the outer
│    // finally skips release when that flag is true.
│    let streamingStarted = false
│    const { readable, writable } = new TransformStream()
│    const writer = writable.getWriter()
│
│    ;(async () => {
│      let fallbackReason: FallbackReason | null = null
│      let allowlistViolation: {class: string; token_count: number} | undefined
│      let ingressStatus = 200
│      let validatorFlips = 0
│      let usage: {prompt_tokens: number; completion_tokens: number} | null = null
│      try {
│        const {response, usage: streamUsage} = await streamAnswer({
│          client, systemPrompt, messages: parsed.data.messages, signal: controller.signal,
│        })
│        usage = streamUsage
│
│        // --- Issue #4 fix: can_answer check runs BEFORE answer_delta emission ---
│        // Determine grounded-happy-path eligibility BEFORE emitting any answer text.
│        // If can_answer === false, skip answer_delta entirely (the refusal text in
│        // `response.answer` is ungrounded and must not leak — Pitfall 5).
│        if (response.can_answer === false) {
│          await writer.write(encodeSse({type:'fallback', reason:'can_answer_false', text: FALLBACK_STRING}))
│          fallbackReason = 'can_answer_false'
│          return
│        }
│
│        const validated = validateCitations(response, REGISTRY)
│        validatorFlips = validated._flips.length
│
│        if (validated.can_answer === false) {
│          // Validator stripped every citation → also suppress answer_delta.
│          await writer.write(encodeSse({type:'fallback', reason:'all_citations_stripped', text: FALLBACK_STRING}))
│          fallbackReason = 'all_citations_stripped'
│          return
│        }
│
│        const allowlist = checkEntityAllowlist(validated.answer)
│        if (!allowlist.passed) {
│          // Allowlist failure → suppress answer_delta (ungrounded entity leaked).
│          await writer.write(encodeSse({type:'fallback', reason:'allowlist_violation', text: FALLBACK_STRING}))
│          fallbackReason = 'allowlist_violation'
│          allowlistViolation = {class: allowlist.violationClass, token_count: allowlist.tokenCount}
│          return
│        }
│
│        // Grounded-happy-path ONLY: emit answer_delta, then citations, then done.
│        if (validated.answer.length > 0) {
│          await writer.write(encodeSse({type:'answer_delta', text: validated.answer}))
│        }
│        await writer.write(encodeSse({type:'citations', citations: validated.citations}))
│        await writer.write(encodeSse({type:'done', can_answer: validated.can_answer, validator_flips: validatorFlips}))
│      } catch (err) {
│        if (err instanceof RefusalError) {
│          // Refusal → suppress answer_delta (nothing to emit anyway — streamAnswer threw).
│          await writer.write(encodeSse({type:'fallback', reason:'refusal', text: FALLBACK_STRING}))
│          fallbackReason = 'refusal'
│        } else if (err instanceof UpstreamTimeoutError) {
│          await writer.write(encodeSse({type:'error', code:'upstream_timeout', message:'request timed out'}))
│        } else if (err instanceof Upstream5xxError) {
│          ingressStatus = err.status
│          await writer.write(encodeSse({type:'error', code:'upstream_5xx', message:`upstream ${err.status}`}))
│        } else if (err instanceof SchemaRejectAfterRetryError) {
│          await writer.write(encodeSse({type:'error', code:'schema_reject_after_retry', message:'upstream returned unparseable response'}))
│        } else if (err instanceof UpstreamAuthError) {
│          ingressStatus = err.status
│          await writer.write(encodeSse({type:'error', code:'internal', message:'upstream auth failure'}))
│        } else {
│          await writer.write(encodeSse({type:'error', code:'internal', message:'internal error'}))
│        }
│      } finally {
│        clearTimeout(totalTimer)
│        request.signal.removeEventListener('abort', onClientAbort)
│        chatSemaphore.release()
│        log.info({
│          validator_flips,
│          refusal_fired: !!fallbackReason,
│          fallback_reason: fallbackReason ?? null,
│          ingress_status_code: ingressStatus,
│          prompt_tokens: usage?.prompt_tokens ?? null,
│          completion_tokens: usage?.completion_tokens ?? null,
│          ...(allowlistViolation && {allowlist_violation: allowlistViolation}),
│          latency_ms: Date.now() - started,
│        }, 'chat request completed')
│        await writer.close().catch(() => {})
│      }
│    })()
│    streamingStarted = true
│    return new Response(readable, {headers: {...sseHeaders, 'X-Request-Id': request_id}})
│  } catch (preStreamErr) {
│    log.warn({err: preStreamErr}, 'pre-stream error')
│    return Response.json({error:'internal', message:'internal error'}, {status: 500})
│  } finally {
│    // Issue #3 fix: every pre-stream early-return path (400, 413, 401, 500)
│    // releases the semaphore here. The streaming IIFE owns its own release
│    // (see its finally above), so we skip release when streamingStarted.
│    if (!streamingStarted) chatSemaphore.release()
│  }
```

**Error code → HTTP status mapping for parseChatRequest:**
- `role_missing`, `role_invalid`, `messages_missing`, `messages_empty`, `message_role_invalid`, `message_content_invalid` → 400
- `history_cap_exceeded`, `message_too_long` → 413
</context>

<tasks>

<task id="4.1" type="auto">
  <name>Task 4.1: GET /api/prompts route handler + tests</name>
  <files>src/app/api/prompts/route.ts, src/app/api/prompts/__tests__/route.test.ts</files>
  <action>
    1. Create `src/app/api/prompts/route.ts`:

       ```ts
       import { SUGGESTED_PROMPTS } from '@/prompts/suggested'

       export const runtime = 'nodejs'
       export const dynamic = 'force-static' // chip list doesn't vary per request

       const ALLOWED = ['consumer', 'author'] as const

       export async function GET(request: Request) {
         const { searchParams } = new URL(request.url)
         const role = searchParams.get('role')
         if (!role) {
           return Response.json(
             { error: 'role_required', allowed: ALLOWED },
             { status: 400 }
           )
         }
         if (role !== 'consumer' && role !== 'author') {
           return Response.json(
             { error: 'role_invalid', allowed: ALLOWED },
             { status: 400 }
           )
         }
         return Response.json(
           { role, prompts: SUGGESTED_PROMPTS[role] },
           {
             status: 200,
             headers: {
               'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
               'Vary': 'Accept-Encoding',
             },
           }
         )
       }
       ```

       Note: `dynamic = 'force-static'` is intentional for this route — the chip list is identical for every caller with the same role, so caching is safe. Contrast with `/api/chat` where `force-dynamic` is required for SSE.

    2. Create `src/app/api/prompts/__tests__/route.test.ts` (per RESEARCH §Vitest Route-Level Testing Pattern — call the handler with a Request object, no HTTP server):
       - GET `/api/prompts?role=consumer` → status 200; body `{role:'consumer', prompts: [5 chips]}`; headers include the locked Cache-Control.
       - GET `/api/prompts?role=author` → status 200; body has 8 chips.
       - GET `/api/prompts` (no query) → status 400; body `{error:'role_required', allowed:['consumer','author']}`.
       - GET `/api/prompts?role=admin` → status 400; body `{error:'role_invalid', allowed:['consumer','author']}`.
       - GET `/api/prompts?role=consumer` response headers include `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` AND `Vary: Accept-Encoding`.
       - GET response content-type is `application/json` (default from Response.json).

    3. Commit: `feat(phase-2/plan-04): add GET /api/prompts route with role validation + Cache-Control`.
  </action>
  <verify>
    `pnpm typecheck` passes. `pnpm test` passes with ≥6 new prompts-route tests. No regressions elsewhere.
  </verify>
  <done>
    `/api/prompts` serves 5 consumer or 8 author chips with locked caching headers; role validation returns the two locked 400 error codes.
  </done>
</task>

<task id="4.2" type="auto">
  <name>Task 4.2: POST /api/chat route handler + route-level tests</name>
  <files>src/app/api/chat/route.ts, src/app/api/chat/__tests__/route.test.ts</files>
  <action>
    **GATE CHECK:** Before starting this task, read `.planning/phases/02-chat-backend-bff/02-01-SUMMARY.md` and confirm `prod_smoke_status === 'green'`. If it is `blocked`, STOP — this task is blocked pending MGTI access. Leave Tasks 4.1 and 4.3 committed; resume this task once the operator re-runs Plan 01 Task 1.1 and flips the status.

    1. Create `src/app/api/chat/route.ts` implementing the pipeline spec from `<context>` above. Reference implementation is in RESEARCH §Pattern 1 (TransformStream writer) + §Pattern 2 (request.signal disconnect) — combined with the locked CONTEXT.md §1–§5 pipeline.

       Key implementation notes:
       - **Semaphore release contract (Issue #3 — MANDATORY):** after `chatSemaphore.tryAcquire()` succeeds, wrap the entire remainder of the handler in `try { ... } finally { if (!streamingStarted) chatSemaphore.release() }`. The streaming IIFE owns its own release on the streaming path. This guarantees validation/auth/pre-stream-error paths (400, 413, 401, 500) do NOT leak the semaphore slot.
       - **answer_delta ordering (Issue #4 — MANDATORY):** NEVER emit `answer_delta` before checking `can_answer`. The correct order in the IIFE is: (1) await streamAnswer; (2) check `response.can_answer === false` → emit only `fallback{reason:'can_answer_false'}`, return; (3) run validator → if fully stripped, emit only `fallback{reason:'all_citations_stripped'}`, return; (4) run allowlist → if fails, emit only `fallback{reason:'allowlist_violation'}`, return; (5) ONLY on the grounded-happy-path, emit `answer_delta` → `citations` → `done`. The refusal-throw path also suppresses answer_delta (streamAnswer threw before any text was available). Document this explicitly with a comment: "answer_delta is only emitted on the grounded-happy-path branch; all fallback paths suppress answer_delta (Pitfall 5 — server refuses to re-narrate workarounds)."
       - **Usage-field logging (Issue #2 / Issue #7 — MANDATORY):** destructure `{response, usage}` from `streamAnswer(...)`. Pass `prompt_tokens: usage?.prompt_tokens ?? null` and `completion_tokens: usage?.completion_tokens ?? null` into the terminal `log.info({...})` call. When streamAnswer throws before returning (timeout, 5xx, refusal, schema reject), `usage` is unset and both fields log as `null`.
       - Pull `NAME_RE`, `KB_ID_RE`, `URL_RE` pattern-matching ONLY via `checkEntityAllowlist` (Plan 02 surface); do not re-implement regex scanning here.
       - Use `makeAnswerTracker()` for future-proofing the answer_delta emission even though streamAnswer returns the full string in Phase-2 (stream:false). Record a `// TODO(v1.1)` comment at the answer_delta emission site explaining why the tracker is present but only called once in the non-streaming facade — this aligns with Plan 03 Task 3.3's inter-chunk deferral.
       - Wrap the entire writer.write flow in try/catch; writer.abort() on failure. Always release the semaphore in finally (per the ordering above).
       - `request.signal.addEventListener('abort', onAbort)` — onAbort calls `controller.abort()` (propagates to streamAnswer) and clears the total-timeout timer. Unregister the listener in finally (prevents leaks across requests).
       - `X-Request-Id` response header echoes the UUID per CONTEXT §5.
       - Pre-stream failures (invalid JSON body, request validation failure, semaphore full, auth stub 401) must NOT open the SSE stream — return a JSON 4xx response directly. The outer finally still releases the semaphore.
       - Log exactly ONCE per request, at terminal-event time, with all CONTEXT §5 fields present (use null for absent optional fields).
       - Time to compute `latency_ms`: capture `started = Date.now()` at route entry; subtract at log time.
       - `ingress_status_code`: capture from Upstream5xxError.status or UpstreamAuthError.status; default 200 on happy/fallback paths (no upstream error ≡ 200).

       File layout:
       ```
       // Imports (grouped: Next.js exports, internal grounding, internal chat primitives, internal llm, internal obs, internal types)
       // Module-level constants (sseHeaders, ALLOWED, etc.)
       // export const runtime, export const dynamic
       // Helper: jsonError(code, status) — for pre-stream 4xx responses
       // Helper: mapParseErrorToStatus(code) — 400|413
       // export async function POST(request: Request)
       ```

    2. Create `src/app/api/chat/__tests__/route.test.ts`. Use the `collectSseFrames()` helper from RESEARCH §Vitest Route-Level Testing Pattern. Mock `streamAnswer` via `vi.mock('@/llm/stream', ...)`. **All mocks return the StreamAnswerResult shape `{response: KbResponse, usage: {prompt_tokens, completion_tokens} | null}` per Plan 03 Task 3.1.** Test cases:

       **Happy path (SC #1):**
       - Valid request, mock returns `{response: <valid KbResponse>, usage: {prompt_tokens: 150, completion_tokens: 42}}` → res.status 200, content-type text/event-stream, frames in EXACT order: [answer_delta, citations, done]; NO fallback frame; NO error frame. done.validator_flips === 0.
       - X-Request-Id header present and UUID-shaped.

       **Fallback paths (SC #2) — all assert ZERO answer_delta frames (Issues #4 and #6):**
       - can_answer_false: mock returns `{response: {can_answer:false, answer:'I cannot answer that', citations:[]}, usage: {prompt_tokens:50, completion_tokens:10}}` → collected frames contain EXACTLY ZERO `answer_delta` frames and EXACTLY ONE `fallback` frame with `reason:'can_answer_false'` and `text === FALLBACK_STRING`; no citations; no done. (Issue #6 fix: this assertion is deterministic — the model's refusal text in `response.answer` does NOT reach the wire.)
       - all_citations_stripped: mock returns valid-looking response with a bogus quote that validator strips fully → ZERO answer_delta frames, EXACTLY ONE `fallback{reason:'all_citations_stripped'}`.
       - refusal: mock throws `new RefusalError('policy')` → ZERO answer_delta frames, EXACTLY ONE `fallback{reason:'refusal'}`.
       - allowlist_violation (SC #3): mock returns valid response but with `answer` text containing "Jane Doe" (not in allowlist) → ZERO answer_delta frames, EXACTLY ONE `fallback{reason:'allowlist_violation'}`; log captures `{class:'names', token_count:1}` (verify via vi.spy on logger); violating token "Jane Doe" NOT in captured log output (string-grep assertion).

       **Error paths:**
       - UpstreamTimeoutError → error{code:'upstream_timeout'}. Zero answer_delta.
       - Upstream5xxError(502) → error{code:'upstream_5xx'}; log ingress_status_code===502. Zero answer_delta.
       - SchemaRejectAfterRetryError → error{code:'schema_reject_after_retry'}. Zero answer_delta.
       - Unknown Error → error{code:'internal'}. Zero answer_delta.

       **Pre-stream errors (HTTP status codes, not SSE):**
       - Malformed JSON body → 400 {error:'messages_missing'}.
       - `{role:'admin'}` → 400 {error:'role_invalid'}.
       - `{role:'consumer'}` (no messages) → 400 {error:'messages_missing'}.
       - `{role:'consumer', messages:[]}` → 400 {error:'messages_empty'}.
       - `{role:'consumer', messages: Array(21).fill({...})}` → 413 {error:'history_cap_exceeded'}.
       - `{role:'consumer', messages:[{role:'user', content:'x'.repeat(9000)}]}` → 413 {error:'message_too_long'}.

       **Concurrency + semaphore-release regression (Issue #3):**
       - Drain chatSemaphore via __resetForTests to cap=0; then POST → 429 with Retry-After:5 header and body {error:'rate_limited'}. Confirm no SSE stream was opened (no content-type: text/event-stream).
       - **Semaphore-leak regression test (Issue #3):** reset the semaphore to cap=1; fire a POST with a malformed body (400 validation failure); immediately after that response resolves, assert `chatSemaphore.tryAcquire() === true` (proves the pre-stream early-return released the slot). Repeat for a 413 case and a 401 case. This proves the outer finally is correctly releasing on all pre-stream exits.
       - **Streaming-path release regression:** fire a happy-path POST (cap=1), drain the response stream, then assert `tryAcquire() === true` (proves the IIFE finally released).

       **Structured log (SC #5) guard — consolidated in one test, includes Issue #7 usage assertion:**
       - Drive a happy-path request (mock streamAnswer with `usage: {prompt_tokens: 123, completion_tokens: 45}`) + an allowlist-violation request + an Upstream5xxError request. Capture all logger output via a test-level pino destination. Assert:
         - Every log entry has keys: `request_id, role, host, validator_flips, refusal_fired, fallback_reason, ingress_status_code, prompt_tokens, completion_tokens, latency_ms`.
         - **Happy-path log entry has `prompt_tokens: 123` AND `completion_tokens: 45` (Issue #7 — concrete numbers from the mock's usage object).**
         - **Error-path log entry (Upstream5xxError — thrown before streamAnswer returns usage) has `prompt_tokens: null` AND `completion_tokens: null`.**
         - No captured log entry contains the substrings: messages_content, answerText, quote, "Jane Doe" (violating token), "user_question". String-grep assertion over concatenated log output.

       **Client disconnect:**
       - Build a Request with an AbortController signal; abort mid-test; assert the route doesn't throw unhandled rejection + semaphore is released (tryAcquire succeeds immediately after).

    3. Commit: `feat(phase-2/plan-04): add POST /api/chat streaming route with validator + allowlist + structured log`.
  </action>
  <verify>
    `pnpm typecheck` passes. `pnpm test` green — chat route tests covering: happy (with usage numbers asserted in log), 4 fallback reasons (each with ZERO answer_delta), 4 error codes (each with ZERO answer_delta), 6 HTTP-400/413 pre-stream, 429, client-disconnect, log-field presence, log-string-grep, **semaphore-leak regression (≥3 pre-stream failure types + 1 streaming-path release)**, **happy-path usage-field log (prompt_tokens+completion_tokens numeric)**, **error-path usage null assertion**. ≥20 new route tests. Quality gate: run the whole suite; ≥140 tests total across the repo.

    Smoke (local): `pnpm dev` then `curl -N -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"role":"consumer","messages":[{"role":"user","content":"How do I flag an article?"}]}'` — observe progressive SSE frames, not a single blob (confirms no buffering).
  </verify>
  <done>
    POST /api/chat pipeline produces the locked SSE event sequences for all scenarios (1 happy + 4 fallback with ZERO answer_delta + 4 error with ZERO answer_delta + 429 + disconnect); semaphore releases on every exit path (validation, auth, streaming success, streaming error); structured log has all CONTEXT §5 fields including prompt_tokens + completion_tokens, and leaks no raw content; smoke-level manual curl confirms streaming cadence.
  </done>
</task>

<task id="4.3" type="auto">
  <name>Task 4.3: Client-facing SSE contract doc for Phase-3 hand-off</name>
  <files>docs/api-chat-contract.md</files>
  <action>
    Create `docs/api-chat-contract.md` — Phase-3 authors consume this to build the chat UI. Target audience: a frontend engineer who has never read CONTEXT.md.

    Required sections (≥80 lines total):

    1. **Endpoint** — `POST /api/chat`, Content-Type application/json, request body shape (role + messages).

    2. **Response format** — `text/event-stream` SSE; frames are `data: <json>\n\n`; parse JSON per frame and discriminate by `.type`.

    3. **Event schema** — table of all five event types with wire shape and payload fields:
       | type | schema | semantics |
       | answer_delta | `{type:'answer_delta', text:string}` | Append text to in-progress answer bubble. In Phase 2 (stream:false facade), a single answer_delta carries the full answer; in v1.1 (true streaming), many smaller deltas arrive. Client code MUST handle both. |
       | citations | `{type:'citations', citations:Citation[]}` | Attach citations to the completed bubble. Arrives AFTER all answer_delta frames on the happy path. |
       | fallback | `{type:'fallback', reason:FallbackReason, text:string}` | **REPLACE** accumulated answer_delta text with event.text (the canonical §15 fallback string). Do not append. |
       | done | `{type:'done', can_answer:boolean, validator_flips:number}` | Terminal success. Stop reading. |
       | error | `{type:'error', code:ErrorCode, message:string}` | Infrastructure failure. Show retry affordance (Phase-3 CHAT-07). |

    4. **Event ordering** — three state diagrams (happy / fallback / error):
       - Happy: answer_delta × N → citations (once) → done.
       - Fallback: answer_delta × {0..N} → fallback (terminal).
       - Error: answer_delta × {0..N} → error (terminal).

    5. **FallbackReason enum** — four values; note that client treats all four identically for rendering (per Phase 4 FBK-03 distinct UI treatment applied uniformly). Reasons are for telemetry.

    6. **ErrorCode enum** — four values with human-readable guidance on retry affordance.

    7. **Pre-stream HTTP errors** — client must check `response.ok` before reading the body. Error codes list (role_required / role_missing / role_invalid / messages_missing / messages_empty / message_role_invalid / message_content_invalid / history_cap_exceeded / message_too_long / rate_limited / unauthorized). For each, one-line UX guidance (e.g., rate_limited → show "We're busy — please retry in a moment"; respect Retry-After header).

    8. **HTTP status codes** — 200 (streaming opens), 400 (validation), 401 (auth stub — Phase 5 adds real), 413 (size cap), 429 (concurrency cap, with Retry-After:5), 500 (internal).

    9. **Reference TypeScript consumer snippet** — ~40 lines of copy-pasteable TS showing the fetch + ReadableStream reader + SSE frame parser + switch on event.type. This is the RESEARCH §SSE Client Contract snippet, adapted for this doc (do not duplicate — embed verbatim with attribution).

    10. **Headers** — X-Request-Id (echo for client-side correlation); Cache-Control: no-cache (chat); Cache-Control: public max-age=3600 stale-while-revalidate=86400 (prompts).

    11. **GET /api/prompts** — brief section: `?role=consumer|author`; response `{role, prompts: ChipItem[]}`; ChipItem `{id, label, text}` shape; 400 error codes role_required / role_invalid.

    12. **Phase boundaries** — short table showing what this doc specifies (wire contract) vs. what Phase-3 / Phase-4 / Phase-5 / Phase-6 add on top (UI treatment, distinct fallback styling, auth, telemetry).

    Commit: `docs(phase-2/plan-04): add /api/chat client contract for Phase-3 hand-off`.
  </action>
  <verify>
    `docs/api-chat-contract.md` exists, ≥80 lines, covers all 12 sections listed. The reference TS snippet compiles (paste into a Vitest test file inside a commented-out block or run `tsc --noEmit` on it via an ad-hoc check — validation is subjective, but the snippet must be syntactically valid).
  </verify>
  <done>
    Phase-3 authors can build the chat client from this doc alone without reading CONTEXT.md. All event types, state diagrams, HTTP codes, and the reference snippet are present.
  </done>
</task>

</tasks>

<verification>
  - `pnpm typecheck` clean.
  - `pnpm test` green — all existing 100+ tests plus new route tests (prompts ~6 + chat ~16+) = ≥135 total.
  - Manual smoke (optional but recommended): `pnpm dev` + curl commands from Task 4.2 verify — happy, fallback, 400, 429 each produce the expected wire shape.
  - Plan 01 Task 1.1 `prod_smoke_status: green` in SUMMARY.md — confirmed before Task 4.2 commit.
  - `docs/api-chat-contract.md` has all 12 sections and the reference TS snippet compiles.
  - No raw user-question text or answer text appears in any log sample collected during the test run (string-grep over captured pino output).
</verification>

<success_criteria>
Phase 2 SC #1 (streaming happy path with answer_delta + validated citations + done): achieved via Task 4.2 happy-path test. Note: with Phase-1 stream:false facade, "streaming" is one answer_delta carrying full text; v1.1 converts to true streaming.

Phase 2 SC #2 (single fallback event, four reasons): achieved via Task 4.2 four fallback tests. Each reason emits one fallback event; no citations leak on any fallback path.

Phase 2 SC #3 (entity allowlist post-check blocks fabricated names/KBs/URLs): achieved via Task 4.2 allowlist_violation test + the log-grep assertion proving the offending token does not leak.

Phase 2 SC #4 (/api/prompts returns 5 Consumer / 8 Author chips): achieved via Task 4.1.

Phase 2 SC #5 (structured logs with locked fields and no raw text): achieved via Task 4.2 log-shape + log-grep tests. Plan 01 logger module + Plan 04 route-level log.call wire it together.

Phase 2 pitfall coverage: Pitfall 2 (validator runs), 5 (fallback wording preserved from FALLBACK_STRING constant, model cannot re-narrate), 6 (allowlist post-check runs), 7 (user text flows ONLY through parsed.data.messages which is passed to streamAnswer as ChatMessage[], never inserted into systemPrompt), 11 (UpstreamAuthError caught), 12 (429 returned when semaphore full; Upstream5xxError after retries exhausted).
</success_criteria>

<output>
After completion, create `.planning/phases/02-chat-backend-bff/02-04-SUMMARY.md`. Capture:
- Manual curl evidence for the happy + fallback + 400 + 429 paths (response headers + first few frames)
- X-Request-Id echo verification
- `pnpm test` total count at phase close
- Known v1.1 TODOs carried forward: true-streaming + inter-chunk timer (Plan 03 marker), per-user rate limit (needs Phase 5 identity), response cache, tenant allowlist (Phase 5)
- Phase 2 closure checklist against all five SCs
</output>

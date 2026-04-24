/**
 * POST /api/chat — Phase-2 streaming Route Handler.
 *
 * Orchestrates the primitives from Plans 01/02/03:
 *   request validation (src/chat/requestSchema) → auth stub
 *   (src/app/api/_middleware) → semaphore (src/chat/concurrency) →
 *   composeSystemPrompt (src/grounding/systemPrompt) → streamAnswer with
 *   AbortSignal (src/llm/stream) → validateCitations (src/grounding/validator)
 *   → checkEntityAllowlist (src/chat/allowlist) → encodeSse
 *   (src/chat/sse) + structured log (src/obs/logger).
 *
 * Pipeline (LOCKED per 02-CONTEXT.md §1, §2, §3, §4, §5):
 *
 *   1. request_id = crypto.randomUUID(); log = requestLogger({request_id, host:'web'})
 *   2. chatSemaphore.tryAcquire(); on false → 429 {error:'rate_limited'} + Retry-After:5
 *   3. try { ... } finally { if (!streamingStarted) chatSemaphore.release() }
 *      — pre-stream early-return paths (400, 413, 401, 500) release here;
 *      the streaming IIFE owns its own release. streamingStarted is flipped
 *      true after the writer is dispatched, so the outer finally skips the
 *      release when the IIFE will do it.
 *   4. Parse JSON body (bad JSON → 400 messages_missing, outer finally fires).
 *   5. parseChatRequest → 400/413 with locked error code (outer finally fires).
 *   6. getRequestUser → 401 on auth failure (outer finally fires).
 *   7. Compose system prompt, create LLM client, set up AbortController with
 *      UPSTREAM_TOTAL_TIMEOUT_MS timer + request.signal abort listener.
 *   8. Open TransformStream. Dispatch background IIFE that:
 *        a. streamAnswer → {response, usage}
 *        b. If response.can_answer === false → fallback{reason:'can_answer_false'},
 *           suppress answer_delta. (Pitfall 5 — server refuses to re-narrate
 *           the model's ungrounded workaround text.)
 *        c. validateCitations(response, REGISTRY) → if can_answer flipped to
 *           false (all citations stripped) → fallback{reason:'all_citations_stripped'},
 *           suppress answer_delta.
 *        d. checkEntityAllowlist(validated.answer) → if !passed →
 *           fallback{reason:'allowlist_violation'}, suppress answer_delta.
 *           Log captures {class, token_count} — violating token NOT logged.
 *        e. Grounded-happy-path ONLY: emit answer_delta (full text in the
 *           stream:false facade — a single delta carries the complete answer;
 *           v1.1 refactor to stream:true makes this truly incremental), then
 *           emit citations, then emit done.
 *      Catch block discriminates on typed errors from src/llm/errors.ts and
 *      emits the corresponding fallback (refusal) or error event.
 *      Finally: clear the total-timer, unregister the abort listener, release
 *      the semaphore, emit the single terminal log.info, close the writer.
 *   9. streamingStarted = true, return Response(readable, {headers: {...sseHeaders, 'X-Request-Id': request_id}}).
 *
 * Pitfall coverage summary:
 *   - #2 (validator as deterministic guard): validateCitations runs EVERY request.
 *   - #5 (server refuses workaround): answer_delta is gated on grounded-happy-path only.
 *   - #6 (allowlist post-check): checkEntityAllowlist runs AFTER validator.
 *   - #7 (injection resistance): user text flows ONLY through parsed.data.messages
 *     into streamAnswer — never inserted into systemPrompt.
 *   - #10 (APIM buffering): X-Accel-Buffering:no header + Node runtime + no
 *     body caching (force-dynamic).
 *   - #11 (ingress auth break): UpstreamAuthError → error{code:'internal'} + log.
 *   - #12 (throttle): 429 on full semaphore + Upstream5xxError after retry exhausted.
 *
 * Plan 04 Task 4.2.
 */

import { FALLBACK_STRING } from '@/grounding/fallback'
import { REGISTRY } from '@/grounding/registry'
import { composeSystemPrompt } from '@/grounding/systemPrompt'
import { validateCitations } from '@/grounding/validator'
import {
  parseChatRequest,
  type ParseChatError,
} from '@/chat/requestSchema'
import { checkEntityAllowlist } from '@/chat/allowlist'
import { chatSemaphore } from '@/chat/concurrency'
import { encodeSse, type FallbackReason } from '@/chat/sse'
import { makeAnswerTracker } from '@/chat/partialAnswer'
import { createLlmClient } from '@/llm/client'
import { streamAnswer } from '@/llm/stream'
import {
  RefusalError,
  SchemaRejectAfterRetryError,
  Upstream5xxError,
  UpstreamAuthError,
  UpstreamTimeoutError,
} from '@/llm/errors'
import { requestLogger } from '@/obs/logger'
import { trackEvent } from '@/obs/telemetry'
import { hashIdentifier, hashQuestion } from '@/obs/questionHash'
import type { SessionContext } from '@/obs/eventSchema'
import { getRequestUser } from '@/app/api/_middleware'
import { env } from '@/config/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// SSE response headers (02-CONTEXT.md §1 "Response shape").
// `X-Accel-Buffering: no` is a defence against any nginx-family hop between
// client and server that might buffer the stream (Pitfall #10).
const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}

function mapParseErrorToStatus(code: ParseChatError): 400 | 413 {
  if (code === 'history_cap_exceeded' || code === 'message_too_long') return 413
  return 400
}

function jsonError(
  code: string,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return Response.json(
    { error: code },
    { status, headers: extraHeaders },
  )
}

export async function POST(request: Request): Promise<Response> {
  const request_id = crypto.randomUUID()
  const started = Date.now()
  let log = requestLogger({ request_id, host: 'web' })

  // Concurrency cap (02-CONTEXT.md §3). Over-cap returns 429 BEFORE opening
  // any SSE stream — client shows a retry affordance (Phase-3 CHAT-07).
  if (!chatSemaphore.tryAcquire()) {
    log.warn({ ingress_status_code: 200 }, 'chat rate-limited (semaphore full)')
    return jsonError('rate_limited', 429, { 'Retry-After': '5', 'X-Request-Id': request_id })
  }

  // Issue #3 semaphore-leak safety: this flag flips true only after the
  // background IIFE is dispatched and `new Response(...)` is about to return.
  // Every pre-stream exit path (JSON parse error, validation, auth, internal
  // error) leaves `streamingStarted === false` so the outer finally releases
  // the slot. When the IIFE is dispatched, it owns the release on all its
  // exit paths (happy, fallback, error) and the outer finally skips the release.
  let streamingStarted = false

  try {
    // --- Pre-stream validation section --------------------------------------

    let body: unknown
    try {
      body = await request.json()
    } catch {
      // Bad JSON → treat as if `messages` were absent. Locked error code per
      // 02-CONTEXT.md §4.1 (no dedicated `body_invalid_json` code exists).
      return jsonError('messages_missing', 400, { 'X-Request-Id': request_id })
    }

    const parsed = parseChatRequest(body)
    if (!parsed.ok) {
      const status = mapParseErrorToStatus(parsed.code)
      return jsonError(parsed.code, status, { 'X-Request-Id': request_id })
    }

    const user = await getRequestUser(request)
    if ('error' in user) {
      // Phase 5.1 — internal AuthResult discriminants were renamed for the
      // session-cookie world (wrong_tenant → forbidden, token_expired →
      // session_expired), but the WIRE error codes (body.error string +
      // HTTP status) are preserved EXACTLY so the frontend ErrorCard,
      // useChatStream, and their ~30 assertions don't change:
      //
      //   session_expired (internal) → 401 { error: 'token_expired' } (wire)
      //   forbidden       (internal) → 403 { error: 'access_denied' } (wire)
      //   unauthorized    (internal) → 401 { error: 'unauthorized' }  (wire)
      //
      // The `forbidden` branch routes the client to the /access-denied page
      // (CONTEXT §Blocked-user UX); `token_expired` drives the 'Sign back
      // in' CTA in ErrorCard. All three use log.warn (distinct from the
      // terminal log.info in the IIFE's finally) to preserve the single-
      // log-per-completed-request invariant; the semaphore-full 429 path
      // already sets the precedent for pre-stream log.warn.
      if (user.error === 'session_expired') {
        log.warn(
          { ingress_status_code: 401, auth_result: 'session_expired' },
          'chat auth failed',
        )
        return jsonError('token_expired', 401, { 'X-Request-Id': request_id })
      }
      if (user.error === 'forbidden') {
        log.warn(
          { ingress_status_code: 403, auth_result: 'forbidden' },
          'chat auth failed',
        )
        return jsonError('access_denied', 403, { 'X-Request-Id': request_id })
      }
      log.warn(
        { ingress_status_code: 401, auth_result: 'unauthorized' },
        'chat auth failed',
      )
      return jsonError('unauthorized', 401, { 'X-Request-Id': request_id })
    }

    // Role is now validated + server-authoritative — pivot it into the child
    // logger so all subsequent log lines carry it alongside request_id + host.
    log = log.child({ role: parsed.data.role })

    // validatedMessages is used both for telemetry (first-turn detection,
    // question_hash) and by the streaming IIFE. Declare here so it is in scope
    // for the telemetry block before the streaming section.
    const validatedMessages = parsed.data.messages

    // --- Telemetry context (Plan 06-02) ------------------------------------
    // Build the per-request correlation context once; spread into every event.
    // session_id_hash uses sub (= Entra OID) — stable across cookie rotations.
    // user_id_hash uses email (= preferred_username) — stable per Entra user.
    // Both are undefined for unauthenticated sessions (health probes, local dev
    // stub that carries a synthetic sub/email — hashed, not raw).
    const role = parsed.data.role as 'consumer' | 'author'
    const ctx: SessionContext = {
      session_id_hash: 'sub' in user ? hashIdentifier(user.sub) : undefined,
      user_id_hash: 'email' in user ? hashIdentifier(user.email) : undefined,
      request_id,
      role,
    }
    const message_id = crypto.randomUUID()

    trackEvent('chat_request_started', { ...ctx, message_id })

    // First-turn detection: if there is exactly one user message, this is the
    // start of a new conversation — emit session_start and role_selected once.
    // Later turns only get chat_request_started + the per-message events below.
    const userMessages = validatedMessages.filter(m => m.role === 'user')
    if (userMessages.length === 1) {
      trackEvent('session_start', { ...ctx, message_id })
      trackEvent('role_selected', { ...ctx, message_id, role })
    }

    // chip_vs_freeform — the request body may carry a chip_id when the user
    // tapped a suggested prompt chip. Plan 03 wires this dimension from the
    // client; until then chip_id arrives as undefined → 'freeform'.
    const chipId = (body as Record<string, unknown>)['chip_id']
    const chipIdStr = typeof chipId === 'string' && chipId.length > 0 ? chipId : undefined
    trackEvent('chip_vs_freeform', {
      ...ctx,
      message_id,
      chip_or_freeform: chipIdStr ? 'chip' : 'freeform',
      chip_id: chipIdStr,
    })

    // question_hash — hash the last user message's content BEFORE streaming.
    // Raw content NEVER flows into trackEvent() — only the 16-hex-char hash.
    const lastUserMsg = [...validatedMessages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      trackEvent('question_hash', {
        ...ctx,
        message_id,
        question_hash: hashQuestion(lastUserMsg.content),
      })
    }

    // --- Streaming section --------------------------------------------------

    const systemPrompt = composeSystemPrompt(parsed.data.role)
    const client = createLlmClient()
    const totalTimeoutMs = env().UPSTREAM_TOTAL_TIMEOUT_MS

    // AbortController bridges (a) the request-total-timeout timer and (b) the
    // client's request.signal (closed-browser / cancelled-fetch) into a
    // single signal that streamAnswer can short-circuit on. The timer + the
    // listener are BOTH torn down in the IIFE finally so neither leaks across
    // requests or fires after the response is closed.
    const controller = new AbortController()
    const totalTimer = setTimeout(() => controller.abort(), totalTimeoutMs)
    const onClientAbort = () => controller.abort()
    request.signal.addEventListener('abort', onClientAbort)

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()

    ;(async () => {
      let fallbackReason: FallbackReason | null = null
      let allowlistViolation:
        | { class: 'names' | 'kbIds' | 'urls'; token_count: number }
        | undefined
      let ingressStatus = 200
      let validatorFlips = 0
      let usage: { prompt_tokens: number; completion_tokens: number } | null = null

      try {
        const streamResult = await streamAnswer({
          client,
          systemPrompt,
          messages: validatedMessages,
          signal: controller.signal,
        })
        const response = streamResult.response
        usage = streamResult.usage

        // --- Issue #4: can_answer check runs BEFORE any answer_delta emit.
        // If the model refused in-schema (can_answer:false), its `answer`
        // field is ungrounded refusal text — NEVER surface it. The client
        // sees only the canonical §15 fallback string via fallback.text
        // (Pitfall 5 — server refuses to re-narrate workarounds).
        if (response.can_answer === false) {
          await writer.write(
            encodeSse({ type: 'fallback', reason: 'can_answer_false', text: FALLBACK_STRING }),
          )
          fallbackReason = 'can_answer_false'
          trackEvent('fallback_trigger', { ...ctx, message_id, reason: 'can_answer_false' })
          return
        }

        const validated = validateCitations(response, REGISTRY)
        validatorFlips = validated._flips.length

        // When the validator stripped at least one citation (but not all),
        // emit validator_flip with the count. This fires even on the happy path
        // if partial strips occurred — distinct from the fallback path below.
        if (validatorFlips > 0 && validated.can_answer !== false) {
          trackEvent('validator_flip', { ...ctx, message_id }, { validator_flips: validatorFlips })
        }

        // Validator flipped everything (total strip) → answer_delta suppressed.
        if (validated.can_answer === false) {
          await writer.write(
            encodeSse({ type: 'fallback', reason: 'all_citations_stripped', text: FALLBACK_STRING }),
          )
          fallbackReason = 'all_citations_stripped'
          trackEvent('fallback_trigger', { ...ctx, message_id, reason: 'all_citations_stripped' })
          return
        }

        const allowlist = checkEntityAllowlist(validated.answer)
        if (!allowlist.passed) {
          await writer.write(
            encodeSse({ type: 'fallback', reason: 'allowlist_violation', text: FALLBACK_STRING }),
          )
          fallbackReason = 'allowlist_violation'
          allowlistViolation = { class: allowlist.violationClass, token_count: allowlist.tokenCount }
          trackEvent('fallback_trigger', { ...ctx, message_id, reason: 'allowlist_violation' })
          trackEvent('allowlist_block', {
            ...ctx,
            message_id,
            violating_class: allowlist.violationClass,
          })
          return
        }

        // Grounded-happy-path: answer_delta → citations → done.
        //
        // TODO(v1.1): makeAnswerTracker() is the future-proof surface for true
        // streaming. In the Phase-2 facade, streamAnswer uses stream:false, so
        // the full answer arrives at once and the tracker emits ONE delta
        // carrying the complete text. When streamAnswer is refactored to
        // stream:true (v1.1 — paired with the inter-chunk idle timer marker
        // in src/llm/stream.ts), the tracker becomes truly incremental without
        // changing this call-site.
        if (validated.answer.length > 0) {
          const tick = makeAnswerTracker()
          // Frame the full answer into the tracker via a synthetic JSON envelope
          // shaped exactly like the OpenAI streaming body would be — the tracker
          // will return the complete answer as a single delta.
          const synthetic = JSON.stringify({ answer: validated.answer })
          const { delta } = tick(synthetic)
          if (delta.length > 0) {
            await writer.write(encodeSse({ type: 'answer_delta', text: delta }))
          }
        }

        // Emit citation_returned for each validated citation (source_id + section_id
        // are safe non-PII KB identifiers — no quote text).
        for (const citation of validated.citations) {
          trackEvent('citation_returned', {
            ...ctx,
            message_id,
            source_id: citation.source_id,
            section_id: citation.section_id,
          })
        }

        await writer.write(
          encodeSse({ type: 'citations', citations: validated.citations }),
        )
        await writer.write(
          encodeSse({
            type: 'done',
            can_answer: validated.can_answer,
            validator_flips: validatorFlips,
          }),
        )
      } catch (err) {
        if (err instanceof RefusalError) {
          await writer.write(
            encodeSse({ type: 'fallback', reason: 'refusal', text: FALLBACK_STRING }),
          )
          fallbackReason = 'refusal'
          trackEvent('fallback_trigger', { ...ctx, message_id, reason: 'refusal' })
        } else if (err instanceof UpstreamTimeoutError) {
          await writer.write(
            encodeSse({ type: 'error', code: 'upstream_timeout', message: 'request timed out' }),
          )
        } else if (err instanceof Upstream5xxError) {
          ingressStatus = err.status
          await writer.write(
            encodeSse({
              type: 'error',
              code: 'upstream_5xx',
              message: `upstream ${err.status}`,
            }),
          )
          trackEvent('ingress_error', {
            ...ctx,
            message_id,
            error_code: `upstream_5xx_${err.status}`,
          })
        } else if (err instanceof SchemaRejectAfterRetryError) {
          await writer.write(
            encodeSse({
              type: 'error',
              code: 'schema_reject_after_retry',
              message: 'upstream returned unparseable response',
            }),
          )
        } else if (err instanceof UpstreamAuthError) {
          // Ingress auth break (Pitfall #11). Map to a generic 'internal' error
          // code on the wire — we don't want to leak credential state to the
          // browser — but log the actual ingress status code for operators.
          ingressStatus = err.status
          await writer.write(
            encodeSse({ type: 'error', code: 'internal', message: 'upstream auth failure' }),
          )
          trackEvent('ingress_error', {
            ...ctx,
            message_id,
            error_code: `upstream_auth_${err.status}`,
          })
        } else {
          await writer.write(
            encodeSse({ type: 'error', code: 'internal', message: 'internal error' }),
          )
        }
      } finally {
        clearTimeout(totalTimer)
        request.signal.removeEventListener('abort', onClientAbort)
        chatSemaphore.release()

        const totalAnswerMs = Date.now() - started

        // Single terminal log entry per request (02-CONTEXT.md §5). ALL locked
        // fields are present; fallback_reason is `null` on the happy path.
        // No raw user-question text, answer text, quote text, or offending
        // allowlist token appears — the logger test in src/obs enforces the
        // module-level "no forbidden strings" guarantee; this call-site
        // composes only the allowed keys.
        log.info(
          {
            validator_flips: validatorFlips,
            refusal_fired: !!fallbackReason,
            fallback_reason: fallbackReason ?? null,
            ingress_status_code: ingressStatus,
            // Plan 05.1-04: operator-visible auth outcome + actor for
            // request correlation. `sub` is the session.user.oid (Entra
            // object ID, a GUID) — not raw user content, so the logger
            // forbidden-substrings invariant (field names
            // user_question/messages/content/answer/quote) stays green.
            // `email` and `roles` from the session are deliberately NOT
            // logged here to minimise PII footprint; `sub` alone is enough
            // for operator correlation back to the Entra directory.
            auth_result: 'success',
            sub: user.sub,
            prompt_tokens: usage?.prompt_tokens ?? null,
            completion_tokens: usage?.completion_tokens ?? null,
            ...(allowlistViolation
              ? { allowlist_violation: allowlistViolation }
              : {}),
            latency_ms: totalAnswerMs,
          },
          'chat request completed',
        )

        // Terminal business event: chat_request_completed carries timing and
        // quality measurements. chunk_count and first_token_ms are Phase-2
        // facade values (single delta = 1 chunk; first_token is the stream
        // open time). retries is not yet exposed by streamAnswer; defaulted 0.
        trackEvent(
          'chat_request_completed',
          { ...ctx, message_id },
          {
            total_answer_ms: totalAnswerMs,
            // chunk_count: Phase-2 stream:false emits exactly 1 delta chunk on
            // the happy path, 0 on fallback/error paths. v1.1 will track per-
            // real-chunk when stream:true is wired.
            chunk_count: fallbackReason === null ? 1 : 0,
            citations_count: 0, // updated below when validated.citations is in scope
            validator_flips: validatorFlips,
            retries: 0, // withRetry() retry count not yet surfaced — defaulted 0
          },
        )

        // Close the writer last — any write failures are swallowed because
        // there's no recovery at this point, and we don't want a writer
        // close error to cause an unhandled rejection inside the IIFE.
        await writer.close().catch(() => {
          /* writer already closed on client disconnect — ignore */
        })
      }
    })()

    // Dispatched — the IIFE is responsible for releasing the semaphore on every
    // exit path it owns. Flip the flag so the outer finally skips its release.
    streamingStarted = true

    return new Response(readable, {
      headers: { ...SSE_HEADERS, 'X-Request-Id': request_id },
    })
  } catch (preStreamErr) {
    // Any error thrown BEFORE streamingStarted flips true (e.g. a defect in
    // parseChatRequest or composeSystemPrompt) surfaces here. Emit a single
    // log line + 500 JSON response; the outer finally still releases the
    // semaphore.
    log.warn({ err: String(preStreamErr) }, 'pre-stream error')
    return jsonError('internal', 500, { 'X-Request-Id': request_id })
  } finally {
    if (!streamingStarted) chatSemaphore.release()
  }
}

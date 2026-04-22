import type OpenAI from 'openai'
import Ajv, { type ValidateFunction } from 'ajv'
import { CITATION_SCHEMA, type KbResponse } from '@/grounding/schema'
import { env } from '@/config/env'
import {
  RefusalError,
  SchemaRejectAfterRetryError,
  Upstream5xxError,
  UpstreamAuthError,
  UpstreamTimeoutError,
  isRetryableUpstream,
} from '@/llm/errors'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamAnswerParams {
  client: OpenAI
  systemPrompt: string
  messages: ChatMessage[]
  /**
   * Per-call override of the strict-mode capability flag. If omitted, the
   * default comes from env().STRICT_SCHEMA_SUPPORTED (Zod-validated; default
   * 'true'). Set the env flag to 'false' when Smoke 2 determines the MGTI
   * deployment does not honour response_format: json_schema strict: true.
   *
   * Reading through env() (not raw process.env) means typos like 'flase',
   * 'False', or '0' are caught at loadEnv() and never silently leave the
   * fallback inactive during an MGTI outage.
   */
  strictSchemaSupported?: boolean
  /**
   * Optional AbortSignal propagated to the upstream fetch (Plan 2-03 Task 3.3).
   * Route (Plan 04) supplies this from an AbortController that fires after
   * env().UPSTREAM_TOTAL_TIMEOUT_MS (default 45000) per CONTEXT.md §3.
   * When the signal aborts, streamAnswer throws UpstreamTimeoutError and the
   * retry loop short-circuits (an aborted request is not retryable).
   *
   * INTER-CHUNK (20s idle between successive stream chunks): NOT implemented
   * in Phase 2. The current streamAnswer uses stream: false, so there are
   * no inter-chunk events to time. See // TODO(v1.1) comment inside
   * streamAnswer for the v1.1 upgrade path.
   */
  signal?: AbortSignal
}

/**
 * Return shape for streamAnswer (Plan 2-03 Task 3.1).
 *
 * `usage` surfaces the OpenAI completion.usage fields Plan 04 logs per
 * CONTEXT.md §5 (prompt_tokens, completion_tokens are locked log keys). The
 * SDK exposes these under completion.usage when upstream returns them — we
 * extract with a runtime guard because not all deployments (older APIM
 * proxies, streaming endpoints) surface the block reliably, and the log
 * emitter treats null as "unknown" rather than dropping the record.
 */
export interface StreamAnswerResult {
  response: KbResponse
  usage: { prompt_tokens: number; completion_tokens: number } | null
}

let cachedValidator: ValidateFunction | null = null
function getValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator
  const ajv = new Ajv({ allErrors: false, strict: false })
  cachedValidator = ajv.compile(CITATION_SCHEMA as object)
  return cachedValidator
}

/**
 * Bounded-retry wrapper with jittered exponential backoff (Plan 2-03 Task 3.2).
 *
 * Policy per CONTEXT.md §3:
 *   - Retry on 429/502/503/504 + network (ECONNRESET/ETIMEDOUT/UND_ERR_SOCKET).
 *   - Do NOT retry on 400/401/403/422 — these reclassify as UpstreamAuthError
 *     for 401/403 (still non-retryable, just typed for route-side routing).
 *   - Retries run BEFORE the first byte is streamed; this wrapper does not
 *     apply to in-flight stream chunks (which is moot today because the
 *     facade is stream:false; v1.1 refactor honours the boundary).
 *   - Backoff: baseMs * 2^attempt + Math.random()*2-1 jittered by ±jitterMs.
 *     attempt=0 → baseMs, attempt=1 → 2*baseMs, etc. Jitter at random=0.5 is 0.
 *   - Retries exhausted on a retryable error → throw Upstream5xxError(status)
 *     so the route can emit error{code:'upstream_unavailable'} (or the 429
 *     variant) per 02-CONTEXT §4.2.
 *
 * Non-retryable errors propagate immediately without invoking setTimeout —
 * callers (and their AbortSignal) see the failure without backoff delay.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  cfg: { max: number; baseMs: number; jitterMs: number; signal?: AbortSignal },
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= cfg.max; attempt++) {
    // Short-circuit if the caller's signal aborted between attempts —
    // we don't want to burn a retry slot after the route has given up.
    // Conversion to UpstreamTimeoutError happens at the streamAnswer
    // call-site; here we just propagate the AbortError-shaped signal.
    if (cfg.signal?.aborted) {
      const abortErr = new Error('Aborted') as Error & { name: string }
      abortErr.name = 'AbortError'
      throw abortErr
    }
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      // Map auth failures to typed errors — still non-retryable, just typed.
      const status = (err as { status?: number })?.status
      if (status === 401 || status === 403) throw new UpstreamAuthError(status)
      if (!isRetryableUpstream(err)) throw err
      if (attempt === cfg.max) break
      const delay = cfg.baseMs * Math.pow(2, attempt) + (Math.random() * 2 - 1) * cfg.jitterMs
      await new Promise(r => setTimeout(r, Math.max(0, delay)))
    }
  }
  // Exhausted retries on a retryable error — surface as Upstream5xxError.
  const s = (lastErr as { status?: number })?.status ?? 0
  if (s >= 500 || s === 429) throw new Upstream5xxError(s, `Retries exhausted (last status ${s})`)
  // Network errors with no HTTP status — rethrow original; route handler
  // treats unrecognized errors as upstream_unavailable.
  throw lastErr
}

/**
 * Runtime-guarded usage extraction. Returns null when the SDK/upstream omits
 * the usage block entirely or surfaces fields of the wrong type. Plan 04's
 * log emitter treats null as "unknown" and still emits the record — we never
 * drop a log for missing metadata.
 */
function extractUsage(completion: unknown): StreamAnswerResult['usage'] {
  const u = (completion as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage
  if (!u || typeof u.prompt_tokens !== 'number' || typeof u.completion_tokens !== 'number') return null
  return { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens }
}

/**
 * Non-streaming Phase-1 facade. Phase 2 adds true SSE streaming (GRND-07).
 *
 * Primary path: response_format: json_schema, strict: true.
 * Fallback path: response_format: json_object + Ajv validation + one retry.
 *   Activated when env().STRICT_SCHEMA_SUPPORTED === 'false' (or per-call
 *   override). Env flag is Zod-validated in env.ts (Plan 01 Task 1.3).
 *
 * Callers never see which branch ran — they always get a StreamAnswerResult
 * (response + usage) or a typed throw (RefusalError, SchemaRejectAfterRetryError,
 * and in Task 3.2/3.3: Upstream5xxError, UpstreamAuthError, UpstreamTimeoutError).
 */
export async function streamAnswer(params: StreamAnswerParams): Promise<StreamAnswerResult> {
  const { client, systemPrompt, messages, signal } = params
  const e = env()
  // Zod-validated: env().STRICT_SCHEMA_SUPPORTED is always the string
  // 'true' or 'false' (default 'true'). Per-call param overrides it when provided.
  const strictSupported =
    params.strictSchemaSupported ?? (e.STRICT_SCHEMA_SUPPORTED !== 'false')

  // Task 3.3: If the caller's signal is already aborted, short-circuit
  // before touching the SDK — saves a wasted fetch and gives the route
  // a crisp UpstreamTimeoutError without waiting on the network.
  if (signal?.aborted) throw new UpstreamTimeoutError()

  const wireMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages,
  ]

  // Retry config read from env() at call time (not at module load) so tests
  // that mutate process.env + call __resetEnvCacheForTests() observe the
  // current values. The AbortSignal is passed through to withRetry so the
  // retry loop also short-circuits between attempts (Task 3.3).
  const retryCfg = {
    max: e.UPSTREAM_RETRY_MAX,
    baseMs: e.UPSTREAM_RETRY_BASE_MS,
    jitterMs: e.UPSTREAM_RETRY_JITTER_MS,
    signal,
  }

  // TODO(v1.1): true-streaming + inter-chunk idle timeout.
  // CONTEXT.md §3 locks a 20s inter-chunk timeout for Pitfall #10 (MGTI APIM
  // buffering). It is NOT implemented here because the current facade uses
  // stream: false — there is no chunk sequence to time. When streamAnswer is
  // refactored to `stream: true` (v1.1 or whenever first-byte latency becomes
  // user-visible), add an inter-chunk timer that resets on each chunk and
  // fires controller.abort() with a distinct InterChunkTimeoutError so the
  // route can emit error{code:'upstream_timeout'} with the right provenance.
  //
  // Observed Phase-0 baseline (Plan 1-05 + Plan 2-01 Task 1.1):
  //   dev-mode P95 inter-chunk = 65ms over 195 chunks (ref)
  //   prod-mode (MGTI APIM) P95 < 500ms — Pitfall #10 ruled out in Plan 2-01.
  // Pick the inter-chunk timeout with generous headroom (e.g. 20s) when
  // implementing v1.1 so transient APIM stalls don't prematurely abort.

  try {
    if (strictSupported) {
      // Upstream-retry loop (429/5xx/network) wraps the single create() call.
      // The Ajv schema-reject retry (fallback path below) is an orthogonal
      // retry that doesn't fire on this strict-mode path — strict mode either
      // returns schema-valid JSON or throws at the API level.
      const completion = await withRetry(() => client.chat.completions.create(
        {
          model: e.LLM_MODEL,
          messages: wireMessages,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'kb_response',
              strict: true,
              schema: CITATION_SCHEMA as Record<string, unknown>,
            },
          },
          stream: false,
        },
        // OpenAI SDK v6 accepts { signal } as the second argument (request
        // options). The SDK propagates this to the underlying fetch call.
        { signal },
      ), retryCfg)
      const msg = completion.choices[0]?.message
      // Explicit refusal detection BEFORE JSON.parse — CONTEXT.md §Research Q1.
      // The OpenAI SDK surfaces safety-filter refusals as message.refusal (non-null
      // string) with message.content typically null. Parsing '{}' would succeed
      // but produce an empty answer — indistinguishable from a model bug. Throw
      // RefusalError so the route can emit fallback{reason:'refusal'} deliberately.
      if (msg?.refusal) throw new RefusalError(msg.refusal)
      const content = msg?.content ?? '{}'
      return { response: JSON.parse(content) as KbResponse, usage: extractUsage(completion) }
    }

    // Fallback: json_object + Ajv + one retry.
    const validator = getValidator()

    async function tryOnce(): Promise<StreamAnswerResult> {
      // Upstream-retry loop also wraps the fallback-path create() — 429/5xx
      // can occur regardless of which response_format was requested. The
      // Ajv schema-reject retry (outer try/catch below tryOnce) is ORTHOGONAL:
      // it retries on SCHEMA rejection, not HTTP errors. Both loops coexist
      // because they address different failure modes.
      const completion = await withRetry(() => client.chat.completions.create(
        {
          model: e.LLM_MODEL,
          messages: wireMessages,
          response_format: { type: 'json_object' },
          stream: false,
        },
        { signal },
      ), retryCfg)
      const msg = completion.choices[0]?.message
      // Same refusal check on the fallback path — the model can refuse
      // regardless of which response_format was requested.
      if (msg?.refusal) throw new RefusalError(msg.refusal)
      const content = msg?.content ?? '{}'
      const parsed = JSON.parse(content)
      if (!validator(parsed)) {
        const errMsg = JSON.stringify(validator.errors)
        throw new Error(`Ajv validation failed: ${errMsg}`)
      }
      return { response: parsed as KbResponse, usage: extractUsage(completion) }
    }

    try {
      return await tryOnce()
    } catch (firstErr) {
      // If the first attempt raised a RefusalError, propagate — retrying after
      // a safety-filter refusal changes nothing; the model will refuse again.
      if (firstErr instanceof RefusalError) throw firstErr
      // Abort-originated errors must propagate to the outer try/catch for
      // UpstreamTimeoutError conversion — don't swallow them via Ajv retry.
      if (isAbortLike(firstErr, signal)) throw firstErr

      // One retry — same system prompt, maybe the model emitted extra whitespace
      // or a stray field that broke Ajv. If this also fails, the caller decides
      // what to do (smoke script fails; Phase 2 route handler flips to fallback
      // via SchemaRejectAfterRetryError).
      try {
        return await tryOnce()
      } catch (retryErr) {
        if (retryErr instanceof RefusalError) throw retryErr
        if (isAbortLike(retryErr, signal)) throw retryErr
        // Both Ajv retries failed — surface as typed error so Plan 04's route
        // can map to error{code:'schema_reject_after_retry'}. Preserve the
        // original diagnostic in .cause for log-site inspection.
        const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr)
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        throw new SchemaRejectAfterRetryError(
          new Error(`streamAnswer json_object fallback failed twice: ${retryMsg} (first: ${firstMsg})`),
        )
      }
    }
  } catch (err) {
    // Task 3.3: Convert AbortError (or an aborted signal that leaked through
    // without producing an AbortError-shaped exception) into the typed
    // UpstreamTimeoutError the route handler discriminates on.
    if (isAbortLike(err, signal)) throw new UpstreamTimeoutError()
    throw err
  }
}

/**
 * Detect abort-originated errors. Covers three cases:
 *   - OpenAI SDK v6 throws APIUserAbortError with name 'APIUserAbortError'.
 *   - Underlying fetch throws DOMException/Error with name 'AbortError'.
 *   - Edge case where withRetry's internal signal check fires ('AbortError').
 *   - Fallback: signal.aborted is true even if the error shape is odd.
 */
function isAbortLike(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  const name = (err as { name?: string })?.name
  return name === 'AbortError' || name === 'APIUserAbortError'
}

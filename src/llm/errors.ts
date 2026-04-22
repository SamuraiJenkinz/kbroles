/**
 * Typed upstream-error classes for the LLM adapter (Plan 2-03 Task 3.1).
 *
 * CONTEXT.md §3 locks five error conditions the route handler must be able to
 * discriminate cleanly. We expose each as a named class with a `readonly name`
 * discriminator so route code can `switch (err.name)` instead of string-match
 * on err.message (which varies by SDK version). Each class carries just enough
 * context (HTTP status where applicable, refusal payload for safety filters,
 * cause chain for schema rejections) for the route to emit the right
 * SSE error / fallback event per 02-CONTEXT §4.
 *
 * isRetryableUpstream() is the classifier withRetry() (Task 3.2) delegates to —
 * 429/502/503/504/ECONNRESET retry; 400/401/403/422 do not. Auth errors 401/403
 * get reclassified into UpstreamAuthError in the retry wrapper itself (still
 * non-retryable, just typed for route-side routing).
 *
 * See also PITFALLS.md #11 (ingress auth break → UpstreamAuthError) and
 * #12 (429 handling → isRetryableUpstream true + withRetry backoff policy).
 */

export class UpstreamTimeoutError extends Error {
  readonly name = 'UpstreamTimeoutError' as const
  constructor(message = 'Upstream timed out') {
    super(message)
  }
}

export class Upstream5xxError extends Error {
  readonly name = 'Upstream5xxError' as const
  readonly status: number
  constructor(status: number, message?: string) {
    super(message ?? `Upstream ${status}`)
    this.status = status
  }
}

export class SchemaRejectAfterRetryError extends Error {
  readonly name = 'SchemaRejectAfterRetryError' as const
  readonly cause?: unknown
  constructor(cause?: unknown) {
    super('Schema rejected after retry')
    this.cause = cause
  }
}

export class RefusalError extends Error {
  readonly name = 'RefusalError' as const
  readonly refusal: string
  constructor(refusal: string) {
    super(`Model refused: ${refusal.slice(0, 80)}`)
    this.refusal = refusal
  }
}

export class UpstreamAuthError extends Error {
  readonly name = 'UpstreamAuthError' as const
  readonly status: 401 | 403
  constructor(status: 401 | 403) {
    super(`Upstream auth ${status}`)
    this.status = status
  }
}

/**
 * Classify an error as retryable per CONTEXT.md §3.
 * Retryable: 429, 502, 503, 504, network (ECONNRESET, ETIMEDOUT, UND_ERR_SOCKET).
 * NOT retryable: 400, 401, 403, 422, or any other path.
 *
 * The OpenAI SDK surfaces HTTP errors as `error.status` on APIError subclasses.
 * Undici (Node fetch) surfaces network errors with `code` at the top level or
 * nested under `.cause.code` depending on wrap depth — we handle both shapes.
 */
export function isRetryableUpstream(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { status?: number; code?: string; cause?: { code?: string } }
  if (typeof e.status === 'number') {
    return e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504
  }
  // Network-level errors (fetch undici): `code` at top level or nested under cause.
  const code = e.code ?? e.cause?.code
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'UND_ERR_SOCKET') return true
  return false
}

/**
 * Server-side event schema catalog (Phase 6 — Plan 02).
 *
 * This file is the SINGLE SOURCE OF TRUTH for the event names emitted from
 * the server pipeline. Plan 03 (client events) and Plan 07 (App Insights
 * workbook KQL) import from this file — never use string literals.
 *
 * ─── Dimension / Measurement conventions ────────────────────────────────────
 *
 * App Insights customDimensions values are strings; numeric quantities go in
 * customMeasurements. The measurement keys used across the event stream are:
 *
 *   first_token_ms   — ms from request start to first streamed token
 *   total_answer_ms  — ms from request start to stream close
 *   citations_count  — number of citations returned in the grounded response
 *   validator_flips  — number of citations stripped by validateCitations()
 *   retries          — number of LLM retries performed by withRetry()
 *   chunk_count      — number of SSE data chunks written to the stream
 *
 * ─── PII Boundaries ─────────────────────────────────────────────────────────
 *
 * The following values MUST NEVER appear in any dimension or measurement of
 * any event emitted via trackEvent() (sourced from CONTEXT.md §PII boundaries):
 *
 *   - Raw question text (user input)
 *   - Raw answer text (LLM output)
 *   - Citation quote text (verbatim KB excerpt)
 *   - Email address / UPN
 *   - Display name
 *   - iron-session cookie value
 *   - Entra tenantId
 *
 * Safe fields: question_hash (16-hex SHA-256 prefix), session_id_hash,
 * user_id_hash, request_id (UUID), message_id (UUID), role enum,
 * source_id (KB number), section_id (KB section slug), error codes/enums.
 */

// ---------------------------------------------------------------------------
// Event name catalog
// ---------------------------------------------------------------------------

/**
 * Canonical list of all telemetry event names emitted by this application.
 *
 * Used as a const-assertion so TypeScript narrows `EventName` to a union of
 * string literals. This prevents typos at call sites: passing an unknown name
 * to trackEvent() will produce a TypeScript error (use @ts-expect-error to
 * confirm — see eventSchema.test.ts for the proof-of-type comment).
 *
 * Naming convention: snake_case, alphanumeric + underscore only, ≤512 chars
 * (App Insights customEvent name limit).
 */
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

/** Union type of all valid event names. */
export type EventName = (typeof EVENT_NAMES)[number]

// ---------------------------------------------------------------------------
// Shared session context (built once per request)
// ---------------------------------------------------------------------------

/**
 * Correlation context attached to every event emitted from a single request.
 *
 * Build this object once after the session is read and pass it to each
 * trackEvent() call by spreading: `trackEvent('...', { ...ctx, <per-event-dims> })`.
 *
 * Values are PII-safe hashes or opaque UUIDs — never raw user claims.
 */
export interface SessionContext {
  /** 16-hex-char SHA-256 hash of the session OID. undefined = unauthenticated. */
  session_id_hash: string | undefined
  /** 16-hex-char SHA-256 hash of the user's preferred_username (email). undefined = unauthenticated. */
  user_id_hash: string | undefined
  /** UUID assigned to this HTTP request at the top of the handler. */
  request_id: string
  /** Validated role from parseChatRequest — 'consumer' | 'author'. undefined pre-auth. */
  role: 'consumer' | 'author' | undefined
}

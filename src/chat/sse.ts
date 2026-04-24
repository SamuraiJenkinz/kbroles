import type { Citation } from '@/grounding/schema'

/**
 * Locked per 02-CONTEXT.md §1. Reasons for `fallback` events.
 *  - refusal: model safety filter refused / structured-output refusal field set
 *  - can_answer_false: model returned can_answer=false in the grounded schema
 *  - all_citations_stripped: validator removed every citation (Phase-1 flip)
 *  - allowlist_violation: answer text contains a non-allowlisted entity (CORP-02)
 *
 * The client renders all four identically (handover §15 verbatim); the reason
 * field is for telemetry only.
 */
export type FallbackReason =
  | 'refusal'
  | 'can_answer_false'
  | 'all_citations_stripped'
  | 'allowlist_violation'

/**
 * Locked per 02-CONTEXT.md §1. Terminal infra-failure codes distinct from
 * grounding fallbacks — client shows a retry affordance, not the §15 string.
 */
export type ErrorCode =
  | 'upstream_timeout'
  | 'upstream_5xx'
  | 'schema_reject_after_retry'
  | 'internal'

/**
 * Five-event discriminated union — 02-CONTEXT.md §1 Event schema.
 *
 * Happy path ordering:  answer_delta × N → citations (once) → done
 * Fallback path:         answer_delta × N (0+) → fallback (terminal)
 * Infra-error path:      answer_delta × N (0+) → error (terminal)
 */
export type SseEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'fallback'; reason: FallbackReason; text: string }
  | { type: 'done'; can_answer: boolean; validator_flips: number }
  | { type: 'error'; code: ErrorCode; message: string }
  // Phase 6 Plan 03 — server echoes message_id so client can correlate
  // feedback/telemetry events with the same UUID used in trackEvent().
  | { type: 'message_id'; id: string }

// Module-level TextEncoder — allocated once per process, reused across every
// encodeSse() call. Per-call allocation would be wasteful on a streaming hot
// path where a single chat response emits hundreds of frames.
const ENC = new TextEncoder()

/** Exposed for tests only — lets sse.test.ts assert the module-level instance. */
/** @internal */
export const __ENC_FOR_TESTS = ENC

/**
 * Encode a typed SSE event as a raw `data: <json>\n\n` frame.
 *
 * Per 02-CONTEXT.md §1 "Framing": raw data: frames with a `type` discriminant
 * — NOT named SSE `event:` lines. This shape survives reverse-proxy
 * reformatting and aligns with the client-side ReadableStream reader that
 * Phase 3 consumes.
 */
export function encodeSse(event: SseEvent): Uint8Array {
  return ENC.encode(`data: ${JSON.stringify(event)}\n\n`)
}

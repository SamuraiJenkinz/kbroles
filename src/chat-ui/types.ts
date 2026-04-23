/**
 * Wire types for the KB Assistant chat UI.
 *
 * MIRROR of docs/api-chat-contract.md §3 (SseEvent), §5 (FallbackReason),
 * §6 (ErrorCode), §9 (Citation), §11 (ChipItem).
 *
 * IMPORTANT: These types must NOT drift from the contract document.
 * The test in src/chat-ui/__tests__/chatReducer.test.ts enforces structural
 * parity for the SseEvent discriminant union.
 *
 * DO NOT import from @/chat/*, @/grounding/*, or @/prompts/* — those are
 * server modules that pull zod + env into the client bundle (RESEARCH §Anti-patterns).
 */

// ─── Role ────────────────────────────────────────────────────────────────────

export type Role = 'consumer' | 'author'

// ─── Citation  (contract §9) ─────────────────────────────────────────────────

export interface Citation {
  source_id: 'KB0020882' | 'KB0022991' | 'SNOW_FORM'
  section_id: string
  quote: string
}

// ─── FallbackReason  (contract §5) ───────────────────────────────────────────

export type FallbackReason =
  | 'refusal'
  | 'can_answer_false'
  | 'all_citations_stripped'
  | 'allowlist_violation'

// ─── ErrorCode  (contract §6) ────────────────────────────────────────────────

export type ErrorCode =
  | 'upstream_timeout'
  | 'upstream_5xx'
  | 'schema_reject_after_retry'
  | 'internal'

// ─── SseEvent  (contract §3) ─────────────────────────────────────────────────

export type SseEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'citations';    citations: Citation[] }
  | { type: 'fallback';     reason: FallbackReason; text: string }
  | { type: 'done';         can_answer: boolean; validator_flips: number }
  | { type: 'error';        code: ErrorCode; message: string }

// ─── ChipItem  (contract §11) ────────────────────────────────────────────────

export interface ChipItem {
  id: string
  label: string
  text: string
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export type FeedbackDown = {
  kind: 'down'
  reason: 'hallucinated' | 'wrong_citation' | 'incomplete' | 'other'
}

export type Feedback = 'up' | FeedbackDown

// ─── Message ─────────────────────────────────────────────────────────────────

export type Message =
  | { kind: 'user'; id: string; text: string; at: number }
  | {
      kind: 'assistant'
      id: string
      state: 'streaming' | 'done' | 'fallback' | 'error'
      text: string
      citations: Citation[]
      at: number
      feedback?: Feedback
      stoppedByUser?: boolean
      errorCode?: ErrorCode
      requestId?: string
    }

// ─── ChatState ───────────────────────────────────────────────────────────────

export type ChatState = {
  messages: Message[]
  inFlightId: string | null
}

// ─── ChatAction ──────────────────────────────────────────────────────────────

export type ChatAction =
  | { type: 'user/send'; id: string; text: string; at: number }
  | { type: 'assistant/start'; id: string; at: number }
  | { type: 'assistant/delta'; id: string; text: string }
  | { type: 'assistant/citations'; id: string; citations: Citation[] }
  | { type: 'assistant/done'; id: string }
  | { type: 'assistant/fallback'; id: string; text: string; requestId: string }
  | { type: 'assistant/error'; id: string; code: ErrorCode; requestId: string }
  | { type: 'assistant/stoppedByUser'; id: string }
  | { type: 'assistant/retry'; id: string }
  | { type: 'feedback/up'; id: string }
  | { type: 'feedback/down'; id: string; reason: FeedbackDown['reason'] }
  | { type: 'feedback/clear'; id: string }
  | { type: 'conversation/clear' }

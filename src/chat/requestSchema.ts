import { z } from 'zod'
import { env } from '@/config/env'

/**
 * /api/chat request body schema + parser with locked error codes.
 *
 * Per 02-CONTEXT.md §4.1, the route handler must produce one of eight
 * specific error codes. A bare `safeParse(body)` on a zod schema would
 * produce a tree of generic issues that does not map 1:1 to those codes
 * (e.g. a missing `role` field would collide with `role_invalid`).
 *
 * Pattern: granular field checks run first — each raising the correct
 * locked code — then `safeParse` runs as belt-and-suspenders to produce
 * the type-inferred `ChatRequest` object. If a granular check has missed
 * anything, the safeParse fallback emits `message_content_invalid` rather
 * than leaking a raw zod error.
 *
 * NOTE: MAX_MESSAGES and MAX_MESSAGE_CHARS are read INSIDE parseChatRequest
 * from env() on every call — NOT cached at module load, and NOT
 * re-exported as wrapper constants. This keeps env as the single source of
 * truth and makes per-test env overrides (__resetEnvCacheForTests + env
 * mutation) take effect without needing parser reconstruction.
 */

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

export const ChatRequestSchema = z.object({
  role: z.enum(['consumer', 'author']),
  messages: z.array(MessageSchema),
})

export type ChatRequest = z.infer<typeof ChatRequestSchema>

/** LOCKED per 02-CONTEXT.md §4.1. Do NOT rename without updating the route + docs. */
export type ParseChatError =
  | 'role_missing'
  | 'role_invalid'
  | 'messages_missing'
  | 'messages_empty'
  | 'message_role_invalid'
  | 'message_content_invalid'
  | 'history_cap_exceeded'
  | 'message_too_long'

export interface ParseChatRequestOk {
  ok: true
  data: ChatRequest
}

export interface ParseChatRequestFail {
  ok: false
  code: ParseChatError
}

export type ParseChatRequestResult = ParseChatRequestOk | ParseChatRequestFail

export function parseChatRequest(body: unknown): ParseChatRequestResult {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'messages_missing' }
  }
  const b = body as Record<string, unknown>

  // Role checks first — finer-grained error codes than zod would produce.
  if (b.role === undefined || b.role === null) {
    return { ok: false, code: 'role_missing' }
  }
  if (b.role !== 'consumer' && b.role !== 'author') {
    return { ok: false, code: 'role_invalid' }
  }

  // Messages-array shape.
  if (!Array.isArray(b.messages)) {
    return { ok: false, code: 'messages_missing' }
  }
  if (b.messages.length === 0) {
    return { ok: false, code: 'messages_empty' }
  }
  if (b.messages.length > env().MAX_MESSAGES) {
    return { ok: false, code: 'history_cap_exceeded' }
  }

  // Per-message shape.
  for (const m of b.messages as unknown[]) {
    if (typeof m !== 'object' || m === null) {
      return { ok: false, code: 'message_role_invalid' }
    }
    const mm = m as Record<string, unknown>
    if (mm.role !== 'user' && mm.role !== 'assistant') {
      return { ok: false, code: 'message_role_invalid' }
    }
    if (typeof mm.content !== 'string') {
      return { ok: false, code: 'message_content_invalid' }
    }
    if (mm.content.length > env().MAX_MESSAGE_CHARS) {
      return { ok: false, code: 'message_too_long' }
    }
  }

  // Belt-and-suspenders: zod should accept anything the granular checks
  // allowed, but if it rejects we surface message_content_invalid (the
  // catch-all code) rather than leaking a raw zod issue.
  const parsed = ChatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, code: 'message_content_invalid' }
  }
  return { ok: true, data: parsed.data }
}

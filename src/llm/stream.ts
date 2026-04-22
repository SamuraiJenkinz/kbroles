import type OpenAI from 'openai'
import Ajv, { type ValidateFunction } from 'ajv'
import { CITATION_SCHEMA, type KbResponse } from '@/grounding/schema'
import { env } from '@/config/env'

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
}

let cachedValidator: ValidateFunction | null = null
function getValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator
  const ajv = new Ajv({ allErrors: false, strict: false })
  cachedValidator = ajv.compile(CITATION_SCHEMA as object)
  return cachedValidator
}

/**
 * Non-streaming Phase-1 facade. Phase 2 adds true SSE streaming (GRND-07).
 *
 * Primary path: response_format: json_schema, strict: true.
 * Fallback path: response_format: json_object + Ajv validation + one retry.
 *   Activated when env().STRICT_SCHEMA_SUPPORTED === 'false' (or per-call
 *   override). Env flag is Zod-validated in env.ts (Plan 01 Task 1.3).
 *
 * Callers never see which branch ran — they always get a KbResponse or a throw.
 */
export async function streamAnswer(params: StreamAnswerParams): Promise<KbResponse> {
  const { client, systemPrompt, messages } = params
  const e = env()
  // Zod-validated: env().STRICT_SCHEMA_SUPPORTED is always the string
  // 'true' or 'false' (default 'true'). Per-call param overrides it when provided.
  const strictSupported =
    params.strictSchemaSupported ?? (e.STRICT_SCHEMA_SUPPORTED !== 'false')

  const wireMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages,
  ]

  if (strictSupported) {
    const completion = await client.chat.completions.create({
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
    })
    const content = completion.choices[0]?.message?.content ?? '{}'
    return JSON.parse(content) as KbResponse
  }

  // Fallback: json_object + Ajv + one retry.
  const validator = getValidator()

  async function tryOnce(): Promise<KbResponse> {
    const completion = await client.chat.completions.create({
      model: e.LLM_MODEL,
      messages: wireMessages,
      response_format: { type: 'json_object' },
      stream: false,
    })
    const content = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(content)
    if (!validator(parsed)) {
      const errMsg = JSON.stringify(validator.errors)
      throw new Error(`Ajv validation failed: ${errMsg}`)
    }
    return parsed as KbResponse
  }

  try {
    return await tryOnce()
  } catch (firstErr) {
    // One retry — same system prompt, maybe the model emitted extra whitespace
    // or a stray field that broke Ajv. If this also fails, the caller decides
    // what to do (smoke script fails; Phase 2 route handler flips to fallback).
    try {
      return await tryOnce()
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      throw new Error(
        `streamAnswer json_object fallback failed twice: ${msg} (first: ${
          firstErr instanceof Error ? firstErr.message : String(firstErr)
        })`
      )
    }
  }
}

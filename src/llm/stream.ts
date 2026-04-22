import type OpenAI from 'openai'
import Ajv, { type ValidateFunction } from 'ajv'
import { CITATION_SCHEMA, type KbResponse } from '@/grounding/schema'
import { env } from '@/config/env'
import { RefusalError, SchemaRejectAfterRetryError } from '@/llm/errors'

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
    const completion = await client.chat.completions.create({
      model: e.LLM_MODEL,
      messages: wireMessages,
      response_format: { type: 'json_object' },
      stream: false,
    })
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

    // One retry — same system prompt, maybe the model emitted extra whitespace
    // or a stray field that broke Ajv. If this also fails, the caller decides
    // what to do (smoke script fails; Phase 2 route handler flips to fallback
    // via SchemaRejectAfterRetryError).
    try {
      return await tryOnce()
    } catch (retryErr) {
      if (retryErr instanceof RefusalError) throw retryErr
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
}

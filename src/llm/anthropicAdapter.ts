/**
 * Anthropic provider adapter (Quick 008).
 *
 * Talks to the MGTI /coreapi/llm/anthropic/v1 proxy, which fronts AWS Bedrock
 * Anthropic Claude 4.5+ models. The proxy speaks the native Anthropic Messages
 * API (NOT OpenAI-compatible), so this adapter does not reuse the OpenAI SDK
 * client. It is a thin fetch wrapper that adapts kbroles' internal request /
 * response shapes (StreamAnswerParams / StreamAnswerResult — defined in
 * src/llm/stream.ts) to/from Anthropic's wire format.
 *
 * Routing: src/llm/stream.ts dispatches to streamAnswerAnthropic when
 * env().LLM_PROVIDER === 'anthropic'. Route handlers (src/app/api/chat/route.ts)
 * call streamAnswer with no awareness of the provider — provider switching is
 * an operator-level configuration change, not a code-path change.
 *
 * Structured-output strategy: the MGTI spec does not document `tools` support,
 * so the json_schema/strict path that the OpenAI adapter uses on the primary
 * path is NOT available here. We rely on:
 *   1. The system prompt teaching the model the citation contract (already
 *      done — composeSystemPrompt produces the same prompt for both providers).
 *   2. Ajv post-validation against CITATION_SCHEMA after JSON.parse.
 *   3. One retry on Ajv failure (matches the OpenAI json_object fallback path).
 * On second-retry failure, throws SchemaRejectAfterRetryError so the route
 * handler can emit error{code:'schema_reject_after_retry'} per 02-CONTEXT §4.2.
 *
 * Guardrails: Bedrock Guardrails are applied to every request by the upstream
 * proxy. A guardrail intervention surfaces as a 200 OK response with empty
 * `content` and `stop_reason: "guardrail_intervened"`. We map this to
 * RefusalError so the route handler emits its existing
 * fallback{reason:'refusal'} event — operationally identical to a safety-
 * filter refusal from the OpenAI path. See MGTI spec "Guardrails" section.
 *
 * AbortSignal: propagated to the fetch call as `signal: signal`. Route-side
 * total-timeout fires this when the request exceeds UPSTREAM_TOTAL_TIMEOUT_MS;
 * we convert AbortError into UpstreamTimeoutError at the outer try/catch
 * so the route's discriminator in src/app/api/chat/route.ts:419-468 handles
 * the failure exactly like it would on the OpenAI path.
 */
import Ajv, { type ValidateFunction } from 'ajv'
import { env } from '@/config/env'
import { CITATION_SCHEMA, type KbResponse } from '@/grounding/schema'
import {
  RefusalError,
  SchemaRejectAfterRetryError,
  Upstream5xxError,
  UpstreamAuthError,
  UpstreamTimeoutError,
} from '@/llm/errors'
import type { ChatMessage, StreamAnswerResult } from '@/llm/stream'

/** Public params — mirrors the OpenAI adapter so streamAnswer can dispatch transparently. */
export interface AnthropicAdapterParams {
  systemPrompt: string
  messages: ChatMessage[]
  signal?: AbortSignal
}

/**
 * Anthropic Messages API response shape (just the fields we read).
 *
 * Content blocks vary by mode:
 *   - text mode (ANTHROPIC_TOOLS_SUPPORTED=false): { type: 'text', text: string }
 *   - tool-use mode (default, Quick 009): { type: 'tool_use', id, name, input: <object> }
 *
 * The `input` field on a tool_use block is an already-parsed JSON object that
 * Bedrock has validated against the tool's input_schema before returning. In
 * our case input_schema === CITATION_SCHEMA, so input matches KbResponse.
 *
 * Full spec includes id/type/role/model — we ignore those.
 */
interface AnthropicResponse {
  content: Array<{
    type: string
    text?: string
    id?: string
    name?: string
    input?: unknown
  }>
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

let cachedValidator: ValidateFunction | null = null
function getValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator
  const ajv = new Ajv({ allErrors: false, strict: false })
  cachedValidator = ajv.compile(CITATION_SCHEMA as object)
  return cachedValidator
}

/**
 * Tool definition shipped on every tool-use-mode request. Reuses the
 * existing CITATION_SCHEMA as the tool's input_schema, so there is no
 * duplicate schema definition anywhere in the codebase — the same schema
 * the OpenAI strict-mode path uses also enforces the Anthropic tool input.
 *
 * Name: `emit_kb_response` reads cleanly in Bedrock logs (kbroles-specific
 * verb). Description tells the model to use this for every reply; we also
 * enforce that via `tool_choice` below.
 */
const KB_RESPONSE_TOOL_NAME = 'emit_kb_response'

/**
 * Build the Anthropic Messages API request body from kbroles' internal shape.
 *
 * Key transformations vs the OpenAI path:
 *   - `systemPrompt` becomes a top-level `system` field, not a message with
 *     role:'system'. Anthropic disallows role:'system' inside the messages
 *     array (returns 400 invalid_request_error).
 *   - `max_tokens` is required. Read from env().ANTHROPIC_MAX_TOKENS (default 1024).
 *   - `anthropic_version` is recommended per the MGTI spec. Read from env.
 *   - `temperature` is read from env. 0 by default (citation-discipline rationale
 *     same as the gpt-4o-mini → gpt-4o-full investigation in quick-006).
 *   - `stream: false` mirrors the OpenAI primary path; v1.1 streaming work
 *     would refactor here and in the dispatcher.
 *
 * Quick 009 — tool-use mode is on when ANTHROPIC_TOOLS_SUPPORTED !== 'false'.
 * Bedrock then enforces CITATION_SCHEMA on the model's tool input at the
 * API level, which is the strict-schema equivalent of OpenAI's
 * `response_format: { type: 'json_schema', strict: true }`. We also set
 * `disable_parallel_tool_use: true` so the model can't emit more than one
 * citation block per response (matches GRND-04's ≤1-citation rule which
 * the validator enforces in src/grounding/validator.ts).
 */
function buildRequestBody(systemPrompt: string, messages: ChatMessage[]): Record<string, unknown> {
  const e = env()
  const base: Record<string, unknown> = {
    anthropic_version: e.ANTHROPIC_VERSION,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    max_tokens: e.ANTHROPIC_MAX_TOKENS,
    temperature: e.ANTHROPIC_TEMPERATURE,
    stream: false,
  }

  if (e.ANTHROPIC_TOOLS_SUPPORTED !== 'false') {
    base.tools = [
      {
        name: KB_RESPONSE_TOOL_NAME,
        description:
          'Emit the grounded knowledge-base response with exactly one citation. ' +
          'Use this tool for every reply, including out-of-scope refusals (set can_answer=false ' +
          'and citations=[] in that case).',
        input_schema: CITATION_SCHEMA,
      },
    ]
    base.tool_choice = {
      type: 'tool',
      name: KB_RESPONSE_TOOL_NAME,
      // Anthropic-specific — guarantees the model emits a single tool_use
      // block per response rather than potentially multiple parallel calls.
      // Aligns with GRND-04 (≤1 citation).
      disable_parallel_tool_use: true,
    }
  }

  return base
}

/**
 * Extract the parsed KbResponse from the Anthropic content array.
 *
 * Two modes:
 *   - tool-use (default): find the tool_use block emitted by the
 *     emit_kb_response tool. Its `input` field is already a parsed JSON
 *     object that Bedrock validated against CITATION_SCHEMA. No JSON.parse.
 *   - text (ANTHROPIC_TOOLS_SUPPORTED=false): find text blocks, concatenate
 *     their `.text` fields, JSON.parse the result. This is the quick-008
 *     original behaviour, preserved as a proxy-regression escape hatch.
 *
 * On structural mismatch (e.g. tool-use mode but no tool_use block in
 * response — would indicate a proxy bug or Bedrock failure), throws so
 * the outer Ajv-retry path in streamAnswerAnthropic gets one more shot.
 */
function extractKbResponse(response: AnthropicResponse): unknown {
  const useTools = env().ANTHROPIC_TOOLS_SUPPORTED !== 'false'

  if (useTools) {
    const toolBlock = response.content?.find(b => b.type === 'tool_use')
    if (!toolBlock) {
      throw new Error(
        'Anthropic response missing tool_use block (tool-use mode expects emit_kb_response tool call)',
      )
    }
    if (toolBlock.name !== KB_RESPONSE_TOOL_NAME) {
      throw new Error(
        `Anthropic response tool_use block has wrong name: expected ${KB_RESPONSE_TOOL_NAME}, got ${String(toolBlock.name)}`,
      )
    }
    if (toolBlock.input === undefined || toolBlock.input === null) {
      throw new Error('Anthropic response tool_use block has empty input field')
    }
    return toolBlock.input
  }

  // Text mode (escape hatch). Concatenate all text blocks, JSON.parse the result.
  const text = response.content
    ?.filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text ?? '')
    .join('') ?? ''
  if (text.length === 0) {
    throw new Error('Anthropic returned empty content with no guardrail signal (text mode)')
  }
  return JSON.parse(text)
}

/**
 * Map MGTI proxy HTTP status to typed errors. Mirrors the policy in
 * src/llm/errors.ts isRetryableUpstream() so route-handler discrimination
 * is provider-agnostic.
 *
 *   401/403 → UpstreamAuthError (Pitfall #11 — ingress auth break)
 *   404     → Upstream5xxError(404) — surfaced as upstream_unavailable
 *             (used for "model not supported" per MGTI spec)
 *   429,5xx → Upstream5xxError (retryable, withRetry wrapper handles)
 *   other   → Upstream5xxError with the actual status
 */
function mapHttpError(status: number, bodyText: string): Error {
  if (status === 401 || status === 403) return new UpstreamAuthError(status)
  if (status >= 500 || status === 429) {
    return new Upstream5xxError(status, `Anthropic proxy ${status}: ${bodyText.slice(0, 200)}`)
  }
  // 4xx other than auth (400 invalid_request, 404 model_not_supported, etc.)
  // — non-retryable, surface as Upstream5xxError so route emits upstream_unavailable.
  return new Upstream5xxError(status, `Anthropic proxy ${status}: ${bodyText.slice(0, 200)}`)
}

/**
 * Single HTTP attempt + parse. Throws typed errors that the outer try/catch
 * (streamAnswerAnthropic) converts to the SchemaReject / Refusal / Timeout
 * categories the route handler discriminates on.
 *
 * The X-Correlation-Id header is set to a fresh UUID per attempt. Per the
 * MGTI spec, this ID is echoed in error responses and is the trace key the
 * Core API team uses to investigate guardrail false-positives.
 */
async function attemptRequest(
  systemPrompt: string,
  messages: ChatMessage[],
  signal: AbortSignal | undefined,
): Promise<StreamAnswerResult> {
  const e = env()
  // URL path is `/model/{name}/messages` per MGTI quickstart.md (commit 4477a7e in
  // mmctech/coreapi-apigee → proxies/llm-anthropic/quickstart.md). The original
  // MGTI spec PDF documented the path as `/model/{name}` without the /messages
  // suffix — that was wrong, confirmed by a 404 rf-route-not-found from Apigee
  // during the Phase A smoke test against the live non-prod NASA proxy
  // (Quick 010 — 2026-05-12). The /messages suffix is mandatory.
  const url = `${e.ANTHROPIC_BASE_URL!.replace(/\/$/, '')}/model/${encodeURIComponent(e.ANTHROPIC_MODEL!)}/messages`
  const body = buildRequestBody(systemPrompt, messages)
  const correlationId = crypto.randomUUID()

  const httpResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': e.ANTHROPIC_API_KEY!,
      'X-Correlation-Id': correlationId,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!httpResponse.ok) {
    const text = await httpResponse.text().catch(() => '')
    throw mapHttpError(httpResponse.status, text)
  }

  const data = (await httpResponse.json()) as AnthropicResponse

  // Guardrail intervention — Bedrock blocked the response. Mirrors the OpenAI
  // path's RefusalError on message.refusal so the route emits fallback{reason:'refusal'}.
  // Note: a successful tool-use response sets stop_reason='tool_use' (NOT
  // 'guardrail_intervened'), so this check correctly excludes the happy path.
  if (data.stop_reason === 'guardrail_intervened') {
    throw new RefusalError('Bedrock guardrail intervened')
  }

  // Quick 009 — extractor branches internally on ANTHROPIC_TOOLS_SUPPORTED.
  // In the default tool-use mode it returns the pre-parsed tool_use input
  // object (Bedrock-schema-validated). In text mode it JSON.parses the
  // concatenated text-block content. Either way, the result is the
  // candidate KbResponse that Ajv validates next as defense-in-depth.
  const parsed = extractKbResponse(data)

  const validator = getValidator()
  if (!validator(parsed)) {
    const errMsg = JSON.stringify(validator.errors)
    throw new Error(`Ajv validation failed: ${errMsg}`)
  }

  // Map Anthropic's input_tokens / output_tokens → kbroles' prompt_tokens /
  // completion_tokens. The route handler treats null as "unknown" and emits
  // the log line with the locked Plan 04 CONTEXT.md §5 field set intact.
  const u = data.usage
  const usage =
    typeof u?.input_tokens === 'number' && typeof u?.output_tokens === 'number'
      ? { prompt_tokens: u.input_tokens, completion_tokens: u.output_tokens }
      : null

  return { response: parsed as KbResponse, usage }
}

/**
 * Public entry: same contract as the OpenAI streamAnswer adapter. Handles:
 *   - One Ajv retry on JSON parse / schema validation failure
 *   - AbortSignal → UpstreamTimeoutError conversion
 *   - Surfacing typed errors the route handler already discriminates on
 *
 * Note: we do NOT implement HTTP-level retry (429/5xx with backoff) in this
 * adapter today. The OpenAI path's withRetry wrapper is the reference; if
 * Anthropic-side throttling becomes an issue in pilot use, port that pattern
 * here. For v0 we let the route handler's UPSTREAM_TOTAL_TIMEOUT_MS bound
 * the worst-case wait and surface Upstream5xxError on the first failure.
 */
export async function streamAnswerAnthropic(
  params: AnthropicAdapterParams,
): Promise<StreamAnswerResult> {
  const { systemPrompt, messages, signal } = params

  if (signal?.aborted) throw new UpstreamTimeoutError()

  try {
    try {
      return await attemptRequest(systemPrompt, messages, signal)
    } catch (firstErr) {
      // Refusals and aborts propagate immediately — retrying after a
      // guardrail intervention or timeout changes nothing.
      if (firstErr instanceof RefusalError) throw firstErr
      if (isAbortLike(firstErr, signal)) throw firstErr
      // Auth + HTTP errors are also not retryable here (matches the OpenAI
      // json_object retry policy — only schema-reject triggers the second
      // attempt; HTTP errors propagate via mapHttpError above).
      if (firstErr instanceof UpstreamAuthError) throw firstErr
      if (firstErr instanceof Upstream5xxError) throw firstErr

      // One Ajv / parse retry — same system prompt + messages. If the second
      // attempt also fails schema, surface SchemaRejectAfterRetryError so the
      // route emits error{code:'schema_reject_after_retry'} per CONTEXT §4.2.
      try {
        return await attemptRequest(systemPrompt, messages, signal)
      } catch (retryErr) {
        if (retryErr instanceof RefusalError) throw retryErr
        if (isAbortLike(retryErr, signal)) throw retryErr
        if (retryErr instanceof UpstreamAuthError) throw retryErr
        if (retryErr instanceof Upstream5xxError) throw retryErr

        const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr)
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        throw new SchemaRejectAfterRetryError(
          new Error(`anthropicAdapter retry failed twice: ${retryMsg} (first: ${firstMsg})`),
        )
      }
    }
  } catch (err) {
    if (isAbortLike(err, signal)) throw new UpstreamTimeoutError()
    throw err
  }
}

/**
 * Detect abort-originated errors from undici/fetch. Covers the same cases
 * as the OpenAI adapter's isAbortLike — AbortError, signal.aborted flag.
 */
function isAbortLike(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  const name = (err as { name?: string })?.name
  return name === 'AbortError'
}

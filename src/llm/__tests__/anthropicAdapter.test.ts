/**
 * Tests for src/llm/anthropicAdapter.ts (Quick 008).
 *
 * Mocks globalThis.fetch since the adapter talks to the MGTI proxy directly
 * (no SDK). Each test sets process.env to the LLM_PROVIDER=anthropic config
 * and asserts the wire request shape, response parsing, and error mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamAnswerAnthropic } from '@/llm/anthropicAdapter'
import { __resetEnvCacheForTests } from '@/config/env'
import {
  RefusalError,
  SchemaRejectAfterRetryError,
  Upstream5xxError,
  UpstreamAuthError,
  UpstreamTimeoutError,
} from '@/llm/errors'

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = globalThis.fetch

const VALID_KB_RESPONSE = JSON.stringify({
  can_answer: true,
  answer: 'Click Flag Article.',
  citations: [
    { source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'Click the Flag Article button' },
  ],
})

function setAnthropicEnv() {
  // Wipe OpenAI vars so the superRefine doesn't complain about both providers
  delete process.env.LLM_AUTH_MODE
  delete process.env.LLM_BASE_URL
  delete process.env.LLM_API_KEY
  delete process.env.LLM_MODEL
  process.env.LLM_PROVIDER = 'anthropic'
  process.env.ANTHROPIC_BASE_URL = 'https://stage.int.nasa.apis.mmc.com/coreapi/llm/anthropic/v1'
  process.env.ANTHROPIC_API_KEY = 'test-api-key'
  process.env.ANTHROPIC_MODEL = 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0'
  // Other ANTHROPIC_* fields fall back to defaults via Zod
  delete process.env.ANTHROPIC_VERSION
  delete process.env.ANTHROPIC_MAX_TOKENS
  delete process.env.ANTHROPIC_TEMPERATURE
  __resetEnvCacheForTests()
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  setAnthropicEnv()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  globalThis.fetch = ORIGINAL_FETCH
  __resetEnvCacheForTests()
  vi.restoreAllMocks()
})

/** Build a mock Response with content blocks + optional stop_reason + usage. */
function mockAnthropicResponse(opts: {
  text?: string
  stop_reason?: string
  usage?: { input_tokens: number; output_tokens: number }
  status?: number
  bodyOverride?: string
}): Response {
  const status = opts.status ?? 200
  const body =
    opts.bodyOverride ??
    JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      content:
        opts.text !== undefined ? [{ type: 'text', text: opts.text }] : [],
      stop_reason: opts.stop_reason ?? 'end_turn',
      usage: opts.usage ?? { input_tokens: 25, output_tokens: 12 },
    })
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

describe('streamAnswerAnthropic — happy path', () => {
  it('returns the parsed KbResponse and usage on a valid content block', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ text: VALID_KB_RESPONSE }))

    const result = await streamAnswerAnthropic({
      systemPrompt: 'You answer KB questions.',
      messages: [{ role: 'user', content: 'How do I flag?' }],
    })

    expect(result.response.can_answer).toBe(true)
    expect(result.response.citations[0].section_id).toBe('flagging-articles')
    expect(result.usage).toEqual({ prompt_tokens: 25, completion_tokens: 12 })
  })

  it('targets POST /model/{modelName} with x-api-key + Content-Type headers + a fresh X-Correlation-Id per attempt', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ text: VALID_KB_RESPONSE }))
    globalThis.fetch = fetchSpy

    await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://stage.int.nasa.apis.mmc.com/coreapi/llm/anthropic/v1/model/eu.anthropic.claude-sonnet-4-5-20250929-v1%3A0',
    )
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('test-api-key')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-Correlation-Id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('sends system prompt as top-level field (not in messages array) + Anthropic body shape', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ text: VALID_KB_RESPONSE }))
    globalThis.fetch = fetchSpy

    await streamAnswerAnthropic({
      systemPrompt: 'SYSTEM_PROMPT_TEXT',
      messages: [{ role: 'user', content: 'q' }],
    })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.system).toBe('SYSTEM_PROMPT_TEXT')
    expect(sentBody.messages).toEqual([{ role: 'user', content: 'q' }])
    expect(sentBody.messages.some((m: { role: string }) => m.role === 'system')).toBe(false)
    expect(sentBody.anthropic_version).toBe('bedrock-2023-05-31') // default
    expect(sentBody.max_tokens).toBe(1024) // default
    expect(sentBody.temperature).toBe(0) // default
    expect(sentBody.stream).toBe(false)
  })

  it('returns usage=null when the response omits the usage block (route logs null as "unknown")', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'test-model',
          content: [{ type: 'text', text: VALID_KB_RESPONSE }],
          stop_reason: 'end_turn',
          // usage intentionally absent
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })
    expect(result.usage).toBeNull()
  })
})

describe('streamAnswerAnthropic — guardrail + refusal paths', () => {
  it('throws RefusalError when stop_reason="guardrail_intervened" (empty content array)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockAnthropicResponse({ stop_reason: 'guardrail_intervened' }),
    )

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toBeInstanceOf(RefusalError)
  })

  it('does NOT retry on guardrail intervention (a second call would be wasted)', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ stop_reason: 'guardrail_intervened' }))
    globalThis.fetch = fetchSpy

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toBeInstanceOf(RefusalError)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('streamAnswerAnthropic — schema-reject retry path', () => {
  it('retries once on JSON parse failure, then succeeds', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockAnthropicResponse({ text: 'not-valid-json' }))
      .mockResolvedValueOnce(mockAnthropicResponse({ text: VALID_KB_RESPONSE }))

    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    expect(result.response.can_answer).toBe(true)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
  })

  it('retries once on Ajv validation failure, then succeeds', async () => {
    const BAD = JSON.stringify({ can_answer: true, answer: 'x' }) // missing citations
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockAnthropicResponse({ text: BAD }))
      .mockResolvedValueOnce(mockAnthropicResponse({ text: VALID_KB_RESPONSE }))

    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    expect(result.response.can_answer).toBe(true)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
  })

  it('throws SchemaRejectAfterRetryError after two Ajv failures', async () => {
    const BAD = JSON.stringify({ not: 'valid' })
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockAnthropicResponse({ text: BAD }))
      .mockResolvedValueOnce(mockAnthropicResponse({ text: BAD }))

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toBeInstanceOf(SchemaRejectAfterRetryError)
  })
})

describe('streamAnswerAnthropic — HTTP error mapping', () => {
  it('maps 401 → UpstreamAuthError', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"error":"invalid api key"}', { status: 401 }))

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toBeInstanceOf(UpstreamAuthError)
  })

  it('maps 403 → UpstreamAuthError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 }))

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toBeInstanceOf(UpstreamAuthError)
  })

  it('maps 500 → Upstream5xxError', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('proxy down', { status: 500 }))

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toBeInstanceOf(Upstream5xxError)
  })

  it('maps 404 (Model not supported per MGTI spec) → Upstream5xxError', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('model not supported', { status: 404 }))

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toBeInstanceOf(Upstream5xxError)
  })

  it('does NOT retry on HTTP errors (Auth, 5xx) — they are non-recoverable in this adapter', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('err', { status: 500 }))
    globalThis.fetch = fetchSpy

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toBeInstanceOf(Upstream5xxError)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('streamAnswerAnthropic — AbortSignal integration', () => {
  it('throws UpstreamTimeoutError immediately when signal is already aborted', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy

    const ctrl = new AbortController()
    ctrl.abort()

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        signal: ctrl.signal,
      }),
    ).rejects.toBeInstanceOf(UpstreamTimeoutError)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('converts fetch AbortError mid-flight → UpstreamTimeoutError', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const err = new Error('aborted')
      ;(err as Error & { name: string }).name = 'AbortError'
      throw err
    })

    const ctrl = new AbortController()
    // Don't abort yet — the mock throws AbortError-shaped exception anyway

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        signal: ctrl.signal,
      }),
    ).rejects.toBeInstanceOf(UpstreamTimeoutError)
  })
})

describe('streamAnswerAnthropic — env config respected', () => {
  it('honours custom ANTHROPIC_MAX_TOKENS + ANTHROPIC_TEMPERATURE + ANTHROPIC_VERSION', async () => {
    process.env.ANTHROPIC_MAX_TOKENS = '2048'
    process.env.ANTHROPIC_TEMPERATURE = '0.3'
    process.env.ANTHROPIC_VERSION = 'custom-version-2024-99-99'
    __resetEnvCacheForTests()

    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ text: VALID_KB_RESPONSE }))
    globalThis.fetch = fetchSpy

    await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.max_tokens).toBe(2048)
    expect(sentBody.temperature).toBe(0.3)
    expect(sentBody.anthropic_version).toBe('custom-version-2024-99-99')
  })
})

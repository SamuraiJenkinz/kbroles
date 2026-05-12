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

const VALID_KB_OBJECT = {
  can_answer: true,
  answer: 'Click Flag Article.',
  citations: [
    { source_id: 'KB0022991', section_id: 'flagging-articles', quote: 'Click the Flag Article button' },
  ],
}
const VALID_KB_JSON = JSON.stringify(VALID_KB_OBJECT)

function setAnthropicEnv(opts?: { toolsSupported?: 'true' | 'false' }) {
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
  if (opts?.toolsSupported === 'false') {
    process.env.ANTHROPIC_TOOLS_SUPPORTED = 'false'
  } else {
    delete process.env.ANTHROPIC_TOOLS_SUPPORTED
  }
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

/**
 * Build a mock Response with content blocks. Mode-aware:
 *   - 'tool' (default): emits a tool_use block with input=parsed object.
 *     Use this for the default tool-use mode (Quick 009). Pass an object
 *     via `toolInput`, or a string via `text` and we'll JSON.parse it.
 *   - 'text': emits a text block with .text=string. Use this for the
 *     ANTHROPIC_TOOLS_SUPPORTED=false fallback path tests.
 */
function mockAnthropicResponse(opts: {
  mode?: 'tool' | 'text'
  text?: string
  toolInput?: unknown
  stop_reason?: string
  usage?: { input_tokens: number; output_tokens: number }
  status?: number
  bodyOverride?: string
}): Response {
  const mode = opts.mode ?? 'tool'
  const status = opts.status ?? 200

  let content: Array<Record<string, unknown>>
  if (opts.bodyOverride) {
    content = [] // ignored; bodyOverride takes precedence
  } else if (opts.text === undefined && opts.toolInput === undefined) {
    content = [] // empty (guardrail path)
  } else if (mode === 'tool') {
    const input =
      opts.toolInput !== undefined
        ? opts.toolInput
        : (opts.text ? safeParse(opts.text) : {})
    content = [
      { type: 'tool_use', id: 'toolu_test_id', name: 'emit_kb_response', input },
    ]
  } else {
    content = [{ type: 'text', text: opts.text ?? '' }]
  }

  const body =
    opts.bodyOverride ??
    JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      content,
      // Tool-use mode success returns stop_reason='tool_use' on the happy path;
      // text-mode returns 'end_turn'. Caller can override.
      stop_reason: opts.stop_reason ?? (mode === 'tool' ? 'tool_use' : 'end_turn'),
      usage: opts.usage ?? { input_tokens: 25, output_tokens: 12 },
    })
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return s }
}

describe('streamAnswerAnthropic — happy path (default tool-use mode)', () => {
  it('returns the parsed KbResponse and usage from a tool_use content block', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ toolInput: VALID_KB_OBJECT }))

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
      .mockResolvedValue(mockAnthropicResponse({ toolInput: VALID_KB_OBJECT }))
    globalThis.fetch = fetchSpy

    await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    // /messages suffix is required by the MGTI proxy per quickstart.md (Quick 010).
    expect(url).toBe(
      'https://stage.int.nasa.apis.mmc.com/coreapi/llm/anthropic/v1/model/eu.anthropic.claude-sonnet-4-5-20250929-v1%3A0/messages',
    )
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('test-api-key')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-Correlation-Id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('sends system prompt as top-level field (not in messages array) + base Anthropic body shape', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ toolInput: VALID_KB_OBJECT }))
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
          content: [
            { type: 'tool_use', id: 'toolu_x', name: 'emit_kb_response', input: VALID_KB_OBJECT },
          ],
          stop_reason: 'tool_use',
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

  it('treats stop_reason="tool_use" as success (NOT as a refusal)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockAnthropicResponse({ toolInput: VALID_KB_OBJECT, stop_reason: 'tool_use' }),
    )
    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })
    expect(result.response.can_answer).toBe(true)
  })
})

describe('streamAnswerAnthropic — strict-tools body shape (Quick 009)', () => {
  it('includes a tools array with emit_kb_response + CITATION_SCHEMA as input_schema', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ toolInput: VALID_KB_OBJECT }))
    globalThis.fetch = fetchSpy

    await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const sentBody = JSON.parse(init.body as string)
    expect(Array.isArray(sentBody.tools)).toBe(true)
    expect(sentBody.tools).toHaveLength(1)
    expect(sentBody.tools[0].name).toBe('emit_kb_response')
    expect(typeof sentBody.tools[0].description).toBe('string')
    // input_schema must be the same CITATION_SCHEMA the validator uses — no
    // duplicate definitions anywhere in the codebase.
    expect(sentBody.tools[0].input_schema.type).toBe('object')
    expect(sentBody.tools[0].input_schema.required).toContain('can_answer')
    expect(sentBody.tools[0].input_schema.required).toContain('citations')
  })

  it('forces tool_choice to emit_kb_response with disable_parallel_tool_use=true', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ toolInput: VALID_KB_OBJECT }))
    globalThis.fetch = fetchSpy

    await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.tool_choice).toEqual({
      type: 'tool',
      name: 'emit_kb_response',
      disable_parallel_tool_use: true,
    })
  })

  it('retries once when the response is missing the tool_use block, then succeeds', async () => {
    // First response: empty content (proxy bug or upstream weirdness)
    // Second response: proper tool_use block
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: 'test-model',
            content: [], // no tool_use block — adapter should retry
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 0 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(mockAnthropicResponse({ toolInput: VALID_KB_OBJECT }))

    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })
    expect(result.response.can_answer).toBe(true)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
  })

  it('retries once when the tool_use block has the wrong tool name', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: 'test-model',
            content: [
              { type: 'tool_use', id: 'toolu_x', name: 'wrong_tool_name', input: VALID_KB_OBJECT },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(mockAnthropicResponse({ toolInput: VALID_KB_OBJECT }))

    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })
    expect(result.response.can_answer).toBe(true)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
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

describe('streamAnswerAnthropic — schema-reject retry path (tool-use mode)', () => {
  it('retries once on Ajv validation failure (malformed tool input), then succeeds', async () => {
    // First tool_use input is missing the required `citations` field — Ajv rejects.
    // Bedrock SHOULD enforce the schema, but Ajv is defense-in-depth in case
    // the proxy returns malformed input under unusual conditions.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockAnthropicResponse({ toolInput: { can_answer: true, answer: 'x' } }),
      )
      .mockResolvedValueOnce(mockAnthropicResponse({ toolInput: VALID_KB_OBJECT }))

    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    expect(result.response.can_answer).toBe(true)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
  })

  it('throws SchemaRejectAfterRetryError after two Ajv failures', async () => {
    const BAD_INPUT = { not: 'valid' }
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockAnthropicResponse({ toolInput: BAD_INPUT }))
      .mockResolvedValueOnce(mockAnthropicResponse({ toolInput: BAD_INPUT }))

    await expect(
      streamAnswerAnthropic({
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toBeInstanceOf(SchemaRejectAfterRetryError)
  })
})

describe('streamAnswerAnthropic — text-mode fallback (ANTHROPIC_TOOLS_SUPPORTED=false)', () => {
  // Escape hatch path — operator flips this flag if the MGTI proxy ever stops
  // honouring `tools` pass-through. Adapter falls back to prompt-only JSON
  // discipline + text content block + JSON.parse + Ajv with one retry.
  beforeEach(() => {
    setAnthropicEnv({ toolsSupported: 'false' })
  })

  it('does NOT include tools or tool_choice in the request body', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ mode: 'text', text: VALID_KB_JSON }))
    globalThis.fetch = fetchSpy

    await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.tools).toBeUndefined()
    expect(sentBody.tool_choice).toBeUndefined()
    // Base fields still present
    expect(sentBody.system).toBe('sys')
    expect(sentBody.max_tokens).toBe(1024)
  })

  it('extracts the parsed KbResponse from a text content block', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse({ mode: 'text', text: VALID_KB_JSON }))

    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    expect(result.response.can_answer).toBe(true)
    expect(result.response.citations[0].section_id).toBe('flagging-articles')
  })

  it('retries once on JSON parse failure, then succeeds', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockAnthropicResponse({ mode: 'text', text: 'not-valid-json' }))
      .mockResolvedValueOnce(mockAnthropicResponse({ mode: 'text', text: VALID_KB_JSON }))

    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    expect(result.response.can_answer).toBe(true)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
  })

  it('retries once on Ajv validation failure, then succeeds', async () => {
    const BAD = JSON.stringify({ can_answer: true, answer: 'x' })
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockAnthropicResponse({ mode: 'text', text: BAD }))
      .mockResolvedValueOnce(mockAnthropicResponse({ mode: 'text', text: VALID_KB_JSON }))

    const result = await streamAnswerAnthropic({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    })

    expect(result.response.can_answer).toBe(true)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
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
      .mockResolvedValue(mockAnthropicResponse({ toolInput: VALID_KB_OBJECT }))
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

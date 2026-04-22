import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamAnswer, type ChatMessage } from '@/llm/stream'
import { RefusalError, SchemaRejectAfterRetryError } from '@/llm/errors'
import { CITATION_SCHEMA } from '@/grounding/schema'
import { __resetEnvCacheForTests } from '@/config/env'
import type OpenAI from 'openai'

const ORIGINAL_ENV = { ...process.env }

interface MockCall {
  model: string
  messages: Array<{ role: string; content: string }>
  response_format: Record<string, unknown>
  stream: boolean
}

/**
 * Shape returned from client.chat.completions.create() that the mock can
 * author directly. `message.refusal` is populated to simulate safety-filter
 * refusals; `usage` is populated to test Plan 04's log-field propagation.
 */
interface MockResponse {
  content?: string | null
  refusal?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
}

function makeMockClient(
  responses: MockResponse[],
): { client: OpenAI; calls: MockCall[] } {
  const calls: MockCall[] = []
  let callIdx = 0
  const client = {
    chat: {
      completions: {
        create: vi.fn(async (params: MockCall) => {
          calls.push(params)
          const response = responses[callIdx++]
          return {
            choices: [{
              message: {
                content: response.refusal ? null : (response.content ?? '{}'),
                ...(response.refusal ? { refusal: response.refusal } : {}),
              },
            }],
            ...(response.usage !== undefined ? { usage: response.usage } : {}),
          }
        }),
      },
    },
  } as unknown as OpenAI
  return { client, calls }
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  process.env.LLM_AUTH_MODE = 'bearer'
  process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
  process.env.LLM_API_KEY   = 'sk-test'
  process.env.LLM_MODEL     = 'gpt-4o-2024-08-06'
  // STRICT_SCHEMA_SUPPORTED intentionally unset — relies on Zod default 'true'
  delete process.env.STRICT_SCHEMA_SUPPORTED
  __resetEnvCacheForTests()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  __resetEnvCacheForTests()
})

const VALID_RESPONSE_JSON = JSON.stringify({
  can_answer: true,
  answer: 'Click Flag Article.',
  citations: [{
    source_id: 'KB0022991',
    section_id: 'flagging-articles',
    quote: 'Click the Flag Article button',
  }],
})

describe('streamAnswer — primary path (json_schema strict)', () => {
  it('sends response_format: json_schema with the citation schema', async () => {
    const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
    const messages: ChatMessage[] = [{ role: 'user', content: 'How do I flag?' }]
    const result = await streamAnswer({
      client, systemPrompt: 'sys', messages, strictSchemaSupported: true,
    })
    expect(calls).toHaveLength(1)
    const rf = calls[0].response_format as {
      type: string
      json_schema: { strict: boolean; name: string; schema: unknown }
    }
    expect(rf.type).toBe('json_schema')
    expect(rf.json_schema.strict).toBe(true)
    expect(rf.json_schema.name).toBe('kb_response')
    expect(rf.json_schema.schema).toBe(CITATION_SCHEMA)
    expect(calls[0].stream).toBe(false)
    expect(result.response.can_answer).toBe(true)
    expect(result.response.citations[0].section_id).toBe('flagging-articles')
  })

  it('prepends systemPrompt as the first message', async () => {
    const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
    await streamAnswer({
      client,
      systemPrompt: 'SYSTEM_PROMPT_TEXT',
      messages: [{ role: 'user', content: 'q' }],
      strictSchemaSupported: true,
    })
    expect(calls[0].messages[0]).toEqual({ role: 'system', content: 'SYSTEM_PROMPT_TEXT' })
    expect(calls[0].messages[1]).toEqual({ role: 'user', content: 'q' })
  })
})

describe('streamAnswer — fallback path (json_object + Ajv)', () => {
  it('sends response_format: json_object when strictSchemaSupported=false', async () => {
    const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
    const result = await streamAnswer({
      client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
      strictSchemaSupported: false,
    })
    const rf = calls[0].response_format as { type: string; json_schema?: unknown }
    expect(rf.type).toBe('json_object')
    expect(rf).not.toHaveProperty('json_schema')
    expect(result.response.can_answer).toBe(true)
  })

  it('retries once on Ajv validation failure, then succeeds', async () => {
    const BAD_JSON = JSON.stringify({ can_answer: true, answer: 'x' }) // missing citations
    const { client, calls } = makeMockClient([
      { content: BAD_JSON },
      { content: VALID_RESPONSE_JSON },
    ])
    const result = await streamAnswer({
      client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
      strictSchemaSupported: false,
    })
    expect(calls).toHaveLength(2) // first attempt failed, retry succeeded
    expect(result.response.can_answer).toBe(true)
  })

  it('throws SchemaRejectAfterRetryError after two Ajv failures (typed, not generic)', async () => {
    const BAD_JSON = JSON.stringify({ not: 'valid' })
    const { client } = makeMockClient([
      { content: BAD_JSON },
      { content: BAD_JSON },
    ])
    await expect(
      streamAnswer({
        client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: false,
      }),
    ).rejects.toBeInstanceOf(SchemaRejectAfterRetryError)
  })

  it('preserves diagnostic chain on SchemaRejectAfterRetryError (.cause carries both messages)', async () => {
    const BAD_JSON = JSON.stringify({ not: 'valid' })
    const { client } = makeMockClient([
      { content: BAD_JSON },
      { content: BAD_JSON },
    ])
    try {
      await streamAnswer({
        client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: false,
      })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaRejectAfterRetryError)
      const e = err as SchemaRejectAfterRetryError
      const causeMsg = (e.cause as Error)?.message ?? ''
      expect(causeMsg).toContain('streamAnswer json_object fallback failed twice')
      expect(causeMsg).toContain('Ajv validation failed')
    }
  })
})

describe('streamAnswer — env flag default (via Zod-validated env())', () => {
  it('defaults to strictSchemaSupported=true when env flag unset (Zod default)', async () => {
    delete process.env.STRICT_SCHEMA_SUPPORTED
    __resetEnvCacheForTests()
    const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
    await streamAnswer({
      client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
    })
    const rf = calls[0].response_format as { type: string }
    expect(rf.type).toBe('json_schema')
  })

  it('respects STRICT_SCHEMA_SUPPORTED=false env flag', async () => {
    process.env.STRICT_SCHEMA_SUPPORTED = 'false'
    __resetEnvCacheForTests()
    const { client, calls } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
    await streamAnswer({
      client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
    })
    const rf = calls[0].response_format as { type: string }
    expect(rf.type).toBe('json_object')
  })

  it('rejects typo values at loadEnv() (Zod enum catches flase/False/0)', async () => {
    process.env.STRICT_SCHEMA_SUPPORTED = 'flase'
    __resetEnvCacheForTests()
    const { client } = makeMockClient([{ content: VALID_RESPONSE_JSON }])
    await expect(
      streamAnswer({
        client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toThrow(/Invalid env/)
  })
})

describe('streamAnswer — refusal detection (Plan 2-03 Task 3.1, CONTEXT.md Q1)', () => {
  it('throws RefusalError on strict path when message.refusal is a non-null string', async () => {
    const { client, calls } = makeMockClient([{ refusal: 'policy violation' }])
    await expect(
      streamAnswer({
        client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    ).rejects.toBeInstanceOf(RefusalError)
    expect(calls).toHaveLength(1) // refusal short-circuits; no retry
  })

  it('RefusalError carries the raw refusal payload for log correlation', async () => {
    const { client } = makeMockClient([{ refusal: 'policy violation: PII detected' }])
    try {
      await streamAnswer({
        client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RefusalError)
      expect((err as RefusalError).refusal).toBe('policy violation: PII detected')
    }
  })

  it('throws RefusalError on fallback path (json_object) when refusal surfaces', async () => {
    const { client, calls } = makeMockClient([{ refusal: 'safety filter' }])
    await expect(
      streamAnswer({
        client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: false,
      }),
    ).rejects.toBeInstanceOf(RefusalError)
    // Exactly ONE call — refusal on fallback MUST NOT trigger the Ajv retry
    // loop (retrying a refusal changes nothing; the model refuses again).
    expect(calls).toHaveLength(1)
  })

  it('throws RefusalError on fallback retry path when second attempt refuses', async () => {
    const BAD_JSON = JSON.stringify({ not: 'valid' })
    const { client, calls } = makeMockClient([
      { content: BAD_JSON },
      { refusal: 'refusing on retry' },
    ])
    await expect(
      streamAnswer({
        client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: false,
      }),
    ).rejects.toBeInstanceOf(RefusalError)
    expect(calls).toHaveLength(2) // first Ajv failure → retry → refusal
  })
})

describe('streamAnswer — usage extraction (Plan 2-03 Task 3.1 — feeds CONTEXT §5 log fields)', () => {
  it('returns usage object when upstream surfaces prompt_tokens + completion_tokens', async () => {
    const { client } = makeMockClient([
      { content: VALID_RESPONSE_JSON, usage: { prompt_tokens: 123, completion_tokens: 45 } },
    ])
    const result = await streamAnswer({
      client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
      strictSchemaSupported: true,
    })
    expect(result.usage).toEqual({ prompt_tokens: 123, completion_tokens: 45 })
  })

  it('returns null when upstream omits the usage block entirely', async () => {
    const { client } = makeMockClient([{ content: VALID_RESPONSE_JSON }]) // no usage field
    const result = await streamAnswer({
      client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
      strictSchemaSupported: true,
    })
    expect(result.usage).toBeNull()
  })

  it('returns null when usage block is present but fields are non-numeric', async () => {
    const { client } = makeMockClient([
      {
        content: VALID_RESPONSE_JSON,
        // Simulate a proxy that strips numeric values
        usage: { prompt_tokens: undefined, completion_tokens: 45 },
      },
    ])
    const result = await streamAnswer({
      client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
      strictSchemaSupported: true,
    })
    expect(result.usage).toBeNull()
  })

  it('surfaces usage identically on fallback (json_object) path', async () => {
    const { client } = makeMockClient([
      { content: VALID_RESPONSE_JSON, usage: { prompt_tokens: 200, completion_tokens: 80 } },
    ])
    const result = await streamAnswer({
      client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
      strictSchemaSupported: false,
    })
    expect(result.usage).toEqual({ prompt_tokens: 200, completion_tokens: 80 })
    expect(result.response.can_answer).toBe(true)
  })
})

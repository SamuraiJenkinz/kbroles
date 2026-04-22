import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamAnswer, type ChatMessage } from '@/llm/stream'
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

function makeMockClient(
  responses: Array<{ content: string }>
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
            choices: [{ message: { content: response.content } }],
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
    expect(result.can_answer).toBe(true)
    expect(result.citations[0].section_id).toBe('flagging-articles')
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
    expect(result.can_answer).toBe(true)
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
    expect(result.can_answer).toBe(true)
  })

  it('throws after two Ajv failures', async () => {
    const BAD_JSON = JSON.stringify({ not: 'valid' })
    const { client } = makeMockClient([
      { content: BAD_JSON },
      { content: BAD_JSON },
    ])
    await expect(
      streamAnswer({
        client, systemPrompt: 'sys', messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: false,
      })
    ).rejects.toThrow(/streamAnswer json_object fallback failed twice/)
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
      })
    ).rejects.toThrow(/Invalid env/)
  })
})

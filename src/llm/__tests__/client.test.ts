import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// MUST mock before importing the module under test — vi.mock is hoisted.
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation((opts: unknown) => ({ _opts: opts })),
}))

import { createLlmClient } from '@/llm/client'
import { __resetEnvCacheForTests } from '@/config/env'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  // Reset process.env for each test to known baseline.
  process.env = { ...ORIGINAL_ENV }
  __resetEnvCacheForTests()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  __resetEnvCacheForTests()
})

describe('createLlmClient — bearer mode', () => {
  it('sets apiKey from env and does NOT set api-key header', () => {
    process.env.LLM_AUTH_MODE = 'bearer'
    process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
    process.env.LLM_API_KEY   = 'sk-test-123'
    process.env.LLM_MODEL     = 'gpt-4o-2024-08-06'

    const client = createLlmClient() as unknown as { _opts: Record<string, unknown> }
    expect(client._opts.baseURL).toBe('https://api.openai.com/v1')
    expect(client._opts.apiKey).toBe('sk-test-123')
    expect(client._opts.defaultHeaders).toBeUndefined()
  })
})

describe('createLlmClient — api-key mode', () => {
  it('sets api-key header and uses placeholder for apiKey', () => {
    process.env.LLM_AUTH_MODE = 'api-key'
    process.env.LLM_BASE_URL  = 'https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1'
    process.env.LLM_API_KEY   = 'mgti-key-xyz'
    process.env.LLM_MODEL     = 'gpt-4o'

    const client = createLlmClient() as unknown as { _opts: Record<string, unknown> }
    expect(client._opts.baseURL).toBe('https://stg1.mmc-dallas-int-non-prod-ingress.mgti.mmc.com/coreapi/openai/v1')
    expect(client._opts.apiKey).toBe('placeholder')
    const headers = client._opts.defaultHeaders as Record<string, string> | undefined
    expect(headers?.['api-key']).toBe('mgti-key-xyz')
  })
})

describe('createLlmClient — env invariants', () => {
  it('throws when LLM_AUTH_MODE is missing', () => {
    process.env.LLM_AUTH_MODE = ''
    process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
    process.env.LLM_API_KEY   = 'sk-test'
    process.env.LLM_MODEL     = 'gpt-4o'
    expect(() => createLlmClient()).toThrow(/Invalid env/)
  })

  it('throws when LLM_AUTH_MODE is invalid', () => {
    process.env.LLM_AUTH_MODE = 'bogus'
    process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
    process.env.LLM_API_KEY   = 'sk-test'
    process.env.LLM_MODEL     = 'gpt-4o'
    expect(() => createLlmClient()).toThrow(/Invalid env/)
  })

  it('throws when LLM_API_KEY is empty', () => {
    process.env.LLM_AUTH_MODE = 'bearer'
    process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
    process.env.LLM_API_KEY   = ''
    process.env.LLM_MODEL     = 'gpt-4o'
    expect(() => createLlmClient()).toThrow(/Invalid env/)
  })
})

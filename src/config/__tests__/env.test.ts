import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadEnv, __resetEnvCacheForTests } from '@/config/env'

const REQUIRED_VARS = {
  LLM_AUTH_MODE: 'bearer',
  LLM_BASE_URL: 'https://api.openai.com/v1',
  LLM_API_KEY: 'test-key',
  LLM_MODEL: 'gpt-4o',
}

describe('env — Phase-2 defaults', () => {
  beforeEach(() => {
    __resetEnvCacheForTests()
  })

  afterEach(() => {
    __resetEnvCacheForTests()
  })

  it('defaults MAX_INFLIGHT_STREAMS to 20 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as NodeJS.ProcessEnv)
    expect(env.MAX_INFLIGHT_STREAMS).toBe(20)
  })

  it('defaults MAX_MESSAGES to 20 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as NodeJS.ProcessEnv)
    expect(env.MAX_MESSAGES).toBe(20)
  })

  it('defaults MAX_MESSAGE_CHARS to 8000 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as NodeJS.ProcessEnv)
    expect(env.MAX_MESSAGE_CHARS).toBe(8000)
  })

  it('coerces string env values ("50") into numbers for MAX_INFLIGHT_STREAMS', () => {
    const env = loadEnv({ ...REQUIRED_VARS, MAX_INFLIGHT_STREAMS: '50' } as NodeJS.ProcessEnv)
    expect(env.MAX_INFLIGHT_STREAMS).toBe(50)
    expect(typeof env.MAX_INFLIGHT_STREAMS).toBe('number')
  })

  it('coerces string env values for MAX_MESSAGES and MAX_MESSAGE_CHARS', () => {
    const env = loadEnv({
      ...REQUIRED_VARS,
      MAX_MESSAGES: '30',
      MAX_MESSAGE_CHARS: '12000',
    } as NodeJS.ProcessEnv)
    expect(env.MAX_MESSAGES).toBe(30)
    expect(env.MAX_MESSAGE_CHARS).toBe(12000)
  })

  it('rejects MAX_INFLIGHT_STREAMS < 1', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, MAX_INFLIGHT_STREAMS: '0' } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })
})

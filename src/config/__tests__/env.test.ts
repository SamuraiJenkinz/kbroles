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

describe('env — Phase-2 upstream resilience defaults (Plan 03 Task 3.2/3.3)', () => {
  beforeEach(() => {
    __resetEnvCacheForTests()
  })

  afterEach(() => {
    __resetEnvCacheForTests()
  })

  it('defaults UPSTREAM_TOTAL_TIMEOUT_MS to 45000 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_TOTAL_TIMEOUT_MS).toBe(45000)
  })

  it('defaults UPSTREAM_RETRY_MAX to 2 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_RETRY_MAX).toBe(2)
  })

  it('defaults UPSTREAM_RETRY_BASE_MS to 500 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_RETRY_BASE_MS).toBe(500)
  })

  it('defaults UPSTREAM_RETRY_JITTER_MS to 250 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_RETRY_JITTER_MS).toBe(250)
  })

  it('coerces string env values for UPSTREAM_TOTAL_TIMEOUT_MS ("60000" → 60000)', () => {
    const env = loadEnv({
      ...REQUIRED_VARS,
      UPSTREAM_TOTAL_TIMEOUT_MS: '60000',
    } as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_TOTAL_TIMEOUT_MS).toBe(60000)
    expect(typeof env.UPSTREAM_TOTAL_TIMEOUT_MS).toBe('number')
  })

  it('rejects UPSTREAM_TOTAL_TIMEOUT_MS below 1000 floor', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, UPSTREAM_TOTAL_TIMEOUT_MS: '500' } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })

  it('rejects UPSTREAM_RETRY_MAX above 5 cap', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, UPSTREAM_RETRY_MAX: '6' } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })

  it('accepts UPSTREAM_RETRY_MAX=0 (no retries allowed)', () => {
    const env = loadEnv({ ...REQUIRED_VARS, UPSTREAM_RETRY_MAX: '0' } as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_RETRY_MAX).toBe(0)
  })
})

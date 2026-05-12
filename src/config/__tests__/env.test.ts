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

  it('defaults LLM_PROVIDER to "openai" when unset (Quick 008 backward compat)', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.LLM_PROVIDER).toBe('openai')
  })

  it('defaults MAX_INFLIGHT_STREAMS to 20 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.MAX_INFLIGHT_STREAMS).toBe(20)
  })

  it('defaults MAX_MESSAGES to 20 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.MAX_MESSAGES).toBe(20)
  })

  it('defaults MAX_MESSAGE_CHARS to 8000 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.MAX_MESSAGE_CHARS).toBe(8000)
  })

  it('coerces string env values ("50") into numbers for MAX_INFLIGHT_STREAMS', () => {
    const env = loadEnv({ ...REQUIRED_VARS, MAX_INFLIGHT_STREAMS: '50' } as unknown as NodeJS.ProcessEnv)
    expect(env.MAX_INFLIGHT_STREAMS).toBe(50)
    expect(typeof env.MAX_INFLIGHT_STREAMS).toBe('number')
  })

  it('coerces string env values for MAX_MESSAGES and MAX_MESSAGE_CHARS', () => {
    const env = loadEnv({
      ...REQUIRED_VARS,
      MAX_MESSAGES: '30',
      MAX_MESSAGE_CHARS: '12000',
    } as unknown as NodeJS.ProcessEnv)
    expect(env.MAX_MESSAGES).toBe(30)
    expect(env.MAX_MESSAGE_CHARS).toBe(12000)
  })

  it('rejects MAX_INFLIGHT_STREAMS < 1', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, MAX_INFLIGHT_STREAMS: '0' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })
})

describe('env — LLM_PROVIDER switching (Quick 008)', () => {
  beforeEach(() => {
    __resetEnvCacheForTests()
  })

  afterEach(() => {
    __resetEnvCacheForTests()
  })

  const ANTHROPIC_VARS = {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_BASE_URL: 'https://int.nasa.apis.mmc.com/coreapi/llm/anthropic/v1',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    ANTHROPIC_MODEL: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
  }

  it('LLM_PROVIDER=anthropic with all 3 required ANTHROPIC_* fields parses cleanly without LLM_* fields', () => {
    const env = loadEnv(ANTHROPIC_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.LLM_PROVIDER).toBe('anthropic')
    expect(env.ANTHROPIC_BASE_URL).toBe(ANTHROPIC_VARS.ANTHROPIC_BASE_URL)
    expect(env.ANTHROPIC_API_KEY).toBe(ANTHROPIC_VARS.ANTHROPIC_API_KEY)
    expect(env.ANTHROPIC_MODEL).toBe(ANTHROPIC_VARS.ANTHROPIC_MODEL)
  })

  it('LLM_PROVIDER=anthropic defaults ANTHROPIC_VERSION to bedrock-2023-05-31', () => {
    const env = loadEnv(ANTHROPIC_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.ANTHROPIC_VERSION).toBe('bedrock-2023-05-31')
  })

  it('LLM_PROVIDER=anthropic defaults ANTHROPIC_MAX_TOKENS to 1024 + coerces string values', () => {
    const env1 = loadEnv(ANTHROPIC_VARS as unknown as NodeJS.ProcessEnv)
    expect(env1.ANTHROPIC_MAX_TOKENS).toBe(1024)

    __resetEnvCacheForTests()
    const env2 = loadEnv({
      ...ANTHROPIC_VARS,
      ANTHROPIC_MAX_TOKENS: '4096',
    } as unknown as NodeJS.ProcessEnv)
    expect(env2.ANTHROPIC_MAX_TOKENS).toBe(4096)
  })

  it('LLM_PROVIDER=anthropic defaults ANTHROPIC_TEMPERATURE to 0 + coerces string values', () => {
    const env1 = loadEnv(ANTHROPIC_VARS as unknown as NodeJS.ProcessEnv)
    expect(env1.ANTHROPIC_TEMPERATURE).toBe(0)

    __resetEnvCacheForTests()
    const env2 = loadEnv({
      ...ANTHROPIC_VARS,
      ANTHROPIC_TEMPERATURE: '0.7',
    } as unknown as NodeJS.ProcessEnv)
    expect(env2.ANTHROPIC_TEMPERATURE).toBe(0.7)
  })

  it('LLM_PROVIDER=anthropic rejects missing ANTHROPIC_API_KEY', () => {
    const { ANTHROPIC_API_KEY: _omit, ...vars } = ANTHROPIC_VARS
    void _omit
    expect(() => loadEnv(vars as unknown as NodeJS.ProcessEnv)).toThrow(/Invalid env/)
  })

  it('LLM_PROVIDER=anthropic rejects missing ANTHROPIC_MODEL', () => {
    const { ANTHROPIC_MODEL: _omit, ...vars } = ANTHROPIC_VARS
    void _omit
    expect(() => loadEnv(vars as unknown as NodeJS.ProcessEnv)).toThrow(/Invalid env/)
  })

  it('LLM_PROVIDER=anthropic rejects missing ANTHROPIC_BASE_URL', () => {
    const { ANTHROPIC_BASE_URL: _omit, ...vars } = ANTHROPIC_VARS
    void _omit
    expect(() => loadEnv(vars as unknown as NodeJS.ProcessEnv)).toThrow(/Invalid env/)
  })

  it('LLM_PROVIDER=anthropic rejects non-URL ANTHROPIC_BASE_URL', () => {
    expect(() =>
      loadEnv({ ...ANTHROPIC_VARS, ANTHROPIC_BASE_URL: 'not-a-url' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })

  it('LLM_PROVIDER=anthropic rejects ANTHROPIC_TEMPERATURE > 1', () => {
    expect(() =>
      loadEnv({ ...ANTHROPIC_VARS, ANTHROPIC_TEMPERATURE: '1.5' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })

  it('ANTHROPIC_TOOLS_SUPPORTED defaults to "true" when unset (Quick 009)', () => {
    const env = loadEnv(ANTHROPIC_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.ANTHROPIC_TOOLS_SUPPORTED).toBe('true')
  })

  it('ANTHROPIC_TOOLS_SUPPORTED accepts "false" (operator escape hatch)', () => {
    const env = loadEnv({
      ...ANTHROPIC_VARS,
      ANTHROPIC_TOOLS_SUPPORTED: 'false',
    } as unknown as NodeJS.ProcessEnv)
    expect(env.ANTHROPIC_TOOLS_SUPPORTED).toBe('false')
  })

  it('ANTHROPIC_TOOLS_SUPPORTED rejects typos like "flase" (Zod enum guard)', () => {
    expect(() =>
      loadEnv({
        ...ANTHROPIC_VARS,
        ANTHROPIC_TOOLS_SUPPORTED: 'flase',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })

  it('LLM_PROVIDER=openai (default) still rejects missing LLM_MODEL', () => {
    const { LLM_MODEL: _omit, ...vars } = REQUIRED_VARS
    void _omit
    expect(() => loadEnv(vars as unknown as NodeJS.ProcessEnv)).toThrow(/Invalid env/)
  })

  it('LLM_PROVIDER=openai (default) still rejects missing LLM_API_KEY', () => {
    const { LLM_API_KEY: _omit, ...vars } = REQUIRED_VARS
    void _omit
    expect(() => loadEnv(vars as unknown as NodeJS.ProcessEnv)).toThrow(/Invalid env/)
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
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_TOTAL_TIMEOUT_MS).toBe(45000)
  })

  it('defaults UPSTREAM_RETRY_MAX to 2 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_RETRY_MAX).toBe(2)
  })

  it('defaults UPSTREAM_RETRY_BASE_MS to 500 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_RETRY_BASE_MS).toBe(500)
  })

  it('defaults UPSTREAM_RETRY_JITTER_MS to 250 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_RETRY_JITTER_MS).toBe(250)
  })

  it('coerces string env values for UPSTREAM_TOTAL_TIMEOUT_MS ("60000" → 60000)', () => {
    const env = loadEnv({
      ...REQUIRED_VARS,
      UPSTREAM_TOTAL_TIMEOUT_MS: '60000',
    } as unknown as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_TOTAL_TIMEOUT_MS).toBe(60000)
    expect(typeof env.UPSTREAM_TOTAL_TIMEOUT_MS).toBe('number')
  })

  it('rejects UPSTREAM_TOTAL_TIMEOUT_MS below 1000 floor', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, UPSTREAM_TOTAL_TIMEOUT_MS: '500' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })

  it('rejects UPSTREAM_RETRY_MAX above 5 cap', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, UPSTREAM_RETRY_MAX: '6' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })

  it('accepts UPSTREAM_RETRY_MAX=0 (no retries allowed)', () => {
    const env = loadEnv({ ...REQUIRED_VARS, UPSTREAM_RETRY_MAX: '0' } as unknown as NodeJS.ProcessEnv)
    expect(env.UPSTREAM_RETRY_MAX).toBe(0)
  })
})

describe('env — Phase-4 CONTENT_STEWARD_EMAIL (Plan 04-01 Task 2)', () => {
  beforeEach(() => {
    __resetEnvCacheForTests()
  })

  afterEach(() => {
    __resetEnvCacheForTests()
  })

  it('defaults CONTENT_STEWARD_EMAIL to kb-knowledge-team@mmc.com when unset', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.CONTENT_STEWARD_EMAIL).toBe('kb-knowledge-team@mmc.com')
  })

  it('accepts a custom email address', () => {
    const env = loadEnv({
      ...REQUIRED_VARS,
      CONTENT_STEWARD_EMAIL: 'steward@example.com',
    } as unknown as NodeJS.ProcessEnv)
    expect(env.CONTENT_STEWARD_EMAIL).toBe('steward@example.com')
  })

  it('rejects an email without @ (regex guard)', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, CONTENT_STEWARD_EMAIL: 'not-an-email' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })
})

describe('env — Phase-5 Entra ID SSO (Plan 05-01 Task 1)', () => {
  beforeEach(() => {
    __resetEnvCacheForTests()
  })

  afterEach(() => {
    __resetEnvCacheForTests()
  })

  it("defaults ENTRA_CLIENT_ID to 'dev-only-do-not-use-in-prod' when unset", () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.ENTRA_CLIENT_ID).toBe('dev-only-do-not-use-in-prod')
  })

  it("defaults ENTRA_TENANT_ID to 'dev-only-do-not-use-in-prod' when unset", () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.ENTRA_TENANT_ID).toBe('dev-only-do-not-use-in-prod')
  })

  it('accepts custom ENTRA_CLIENT_ID + ENTRA_TENANT_ID values', () => {
    const env = loadEnv({
      ...REQUIRED_VARS,
      ENTRA_CLIENT_ID: 'abc',
      ENTRA_TENANT_ID: 'def',
    } as unknown as NodeJS.ProcessEnv)
    expect(env.ENTRA_CLIENT_ID).toBe('abc')
    expect(env.ENTRA_TENANT_ID).toBe('def')
  })

  it('rejects empty-string ENTRA_CLIENT_ID (z.string().min(1) guard)', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, ENTRA_CLIENT_ID: '' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })

  it('rejects empty-string ENTRA_TENANT_ID (z.string().min(1) guard)', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, ENTRA_TENANT_ID: '' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })
})

describe('env — Phase-5.1 BFF pivot (Plan 05.1-01 Task 1)', () => {
  beforeEach(() => {
    __resetEnvCacheForTests()
  })

  afterEach(() => {
    __resetEnvCacheForTests()
  })

  it('accepts a custom SESSION_SECRET (>=32 chars)', () => {
    const env = loadEnv({
      ...REQUIRED_VARS,
      SESSION_SECRET: 'x'.repeat(32),
    } as unknown as NodeJS.ProcessEnv)
    expect(env.SESSION_SECRET).toBe('x'.repeat(32))
  })

  it('defaults SESSION_SECRET to a string >=32 chars when unset (iron-session AES-256-GCM requirement)', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.SESSION_SECRET.length).toBeGreaterThanOrEqual(32)
  })

  it('rejects non-URL APP_BASE_URL', () => {
    expect(() =>
      loadEnv({ ...REQUIRED_VARS, APP_BASE_URL: 'not-a-url' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid env/)
  })

  it('defaults APP_BASE_URL to http://localhost:3000 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.APP_BASE_URL).toBe('http://localhost:3000')
  })

  it('defaults AWS_SECRET_NAME to /mmc/cts/kb-assistant and AWS_REGION to us-east-1 when unset', () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.AWS_SECRET_NAME).toBe('/mmc/cts/kb-assistant')
    expect(env.AWS_REGION).toBe('us-east-1')
  })

  it('accepts a custom ENTRA_CLIENT_SECRET', () => {
    const env = loadEnv({
      ...REQUIRED_VARS,
      ENTRA_CLIENT_SECRET: 'real-secret',
    } as unknown as NodeJS.ProcessEnv)
    expect(env.ENTRA_CLIENT_SECRET).toBe('real-secret')
  })

  it("defaults ENTRA_CLIENT_SECRET to 'dev-only-do-not-use-in-prod' when unset", () => {
    const env = loadEnv(REQUIRED_VARS as unknown as NodeJS.ProcessEnv)
    expect(env.ENTRA_CLIENT_SECRET).toBe('dev-only-do-not-use-in-prod')
  })
})

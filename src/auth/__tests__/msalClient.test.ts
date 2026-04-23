import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock @azure/msal-node so tests don't need real credentials. Capture the
// constructor arg so we can assert it matches the expected shape.
const constructorSpy = vi.fn()
vi.mock('@azure/msal-node', () => {
  return {
    LogLevel: { Error: 0, Warning: 1, Info: 2, Verbose: 3 },
    ConfidentialClientApplication: vi.fn().mockImplementation((config) => {
      constructorSpy(config)
      return { __mock: true, config }
    }),
  }
})

// Mock env() so we don't need a real .env.
vi.mock('@/config/env', () => ({
  env: () => ({
    ENTRA_CLIENT_ID: 'test-client-id',
    ENTRA_TENANT_ID: 'test-tenant-id',
    ENTRA_CLIENT_SECRET: 'test-secret',
  }),
}))

// Import UNDER TEST after mocks are registered.
import { getCca, __resetCcaForTests } from '../msalClient'

describe('getCca', () => {
  beforeEach(() => {
    __resetCcaForTests()
    constructorSpy.mockClear()
  })

  it('returns the same instance on repeated calls (singleton)', () => {
    const a = getCca()
    const b = getCca()
    expect(a).toBe(b)
    expect(constructorSpy).toHaveBeenCalledTimes(1)
  })

  it('passes auth.clientId / authority / clientSecret from env()', () => {
    getCca()
    expect(constructorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          clientId: 'test-client-id',
          authority: 'https://login.microsoftonline.com/test-tenant-id',
          clientSecret: 'test-secret',
        }),
      }),
    )
  })

  it('authority does NOT contain /v2.0 (msal-node appends it internally)', () => {
    getCca()
    const cfg = constructorSpy.mock.calls[0][0]
    expect(cfg.auth.authority).not.toContain('/v2.0')
  })

  it('sets piiLoggingEnabled=false', () => {
    getCca()
    const cfg = constructorSpy.mock.calls[0][0]
    expect(cfg.system.loggerOptions.piiLoggingEnabled).toBe(false)
  })

  it('__resetCcaForTests nulls the cache so next call constructs a fresh instance', () => {
    const first = getCca()
    __resetCcaForTests()
    const second = getCca()
    expect(first).not.toBe(second)
    expect(constructorSpy).toHaveBeenCalledTimes(2)
  })
})

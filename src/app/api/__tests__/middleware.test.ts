import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getRequestUser } from '@/app/api/_middleware'
import { __resetEnvCacheForTests } from '@/config/env'

describe('getRequestUser — stub auth middleware', () => {
  beforeEach(() => {
    __resetEnvCacheForTests()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    __resetEnvCacheForTests()
  })

  it('dev (NODE_ENV=development): any request returns the local-dev stub user', () => {
    vi.stubEnv('NODE_ENV', 'development')

    // No Authorization header — dev path is permissive; should still succeed.
    const req = new Request('https://example.test/api/chat', { method: 'POST' })

    const result = getRequestUser(req)

    expect(result).toEqual({ sub: 'local-dev', tenantId: 'local-dev' })
  })

  it('prod (NODE_ENV=production) with no Authorization header: returns { error: "unauthorized" }', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const req = new Request('https://example.test/api/chat', { method: 'POST' })

    const result = getRequestUser(req)

    expect(result).toEqual({ error: 'unauthorized' })
  })

  it('prod (NODE_ENV=production) with "Authorization: Bearer <anything>": returns prod-stub user (Phase-5 replaces)', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const req = new Request('https://example.test/api/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer opaque-token-value' },
    })

    const result = getRequestUser(req)

    // This asserts the Phase-4 expected behaviour, NOT the Phase-5 behaviour.
    // When Phase 5 lands MSAL validation, this test should be updated to
    // stub a JWKS-verifiable token and assert { sub: jwt.oid, tenantId: jwt.tid }.
    expect(result).toEqual({ sub: 'prod-stub', tenantId: 'prod-stub' })
  })
})

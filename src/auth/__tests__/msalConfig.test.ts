/**
 * NOTE: we do NOT test getMsalInstance() directly here — it calls
 * createNestablePublicClientApplication which internally makes network
 * requests to the authority /v2.0/.well-known/openid-configuration endpoint.
 * Covered by an E2E / browser smoke in Plan 04 AuthProvider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('msalConfig — shape assertions', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('authority is https://login.microsoftonline.com/<tenantId> with NO trailing /v2.0 (MSAL adds it)', async () => {
    const { msalConfig } = await import('../msalConfig')
    expect(msalConfig.auth.authority).toMatch(/^https:\/\/login\.microsoftonline\.com\/[^/]+$/)
    expect(msalConfig.auth.authority).not.toMatch(/\/v2\.0$/)
  })

  it("cacheLocation is 'sessionStorage' (RESEARCH Pattern 1)", async () => {
    const { msalConfig } = await import('../msalConfig')
    expect(msalConfig.cache?.cacheLocation).toBe('sessionStorage')
  })

  it('DEFAULT_SCOPES includes openid, profile, email, User.Read', async () => {
    const { DEFAULT_SCOPES } = await import('../msalConfig')
    expect(DEFAULT_SCOPES).toEqual(expect.arrayContaining(['openid', 'profile', 'email', 'User.Read']))
    expect(DEFAULT_SCOPES).toHaveLength(4)
  })

  it('authority reflects NEXT_PUBLIC_ENTRA_TENANT_ID when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENTRA_TENANT_ID', '11111111-2222-3333-4444-555555555555')
    const { msalConfig } = await import('../msalConfig')
    expect(msalConfig.auth.authority).toBe(
      'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555',
    )
  })

  it('clientId reflects NEXT_PUBLIC_ENTRA_CLIENT_ID when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENTRA_CLIENT_ID', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    const { msalConfig } = await import('../msalConfig')
    expect(msalConfig.auth.clientId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })

  it('defaults clientId + tenantId to dev placeholder when env vars unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENTRA_CLIENT_ID', '')
    vi.stubEnv('NEXT_PUBLIC_ENTRA_TENANT_ID', '')
    // Explicit unstub to let `process.env.NEXT_PUBLIC_ENTRA_*` be undefined so the ?? default kicks in.
    vi.unstubAllEnvs()
    const { msalConfig } = await import('../msalConfig')
    expect(msalConfig.auth.clientId).toBe('dev-only-do-not-use-in-prod')
    expect(msalConfig.auth.authority).toBe(
      'https://login.microsoftonline.com/dev-only-do-not-use-in-prod',
    )
  })

  it('redirectUri falls back to /auth/redirect when window is undefined (SSR/test context)', async () => {
    const { msalConfig } = await import('../msalConfig')
    // In vitest node env the module loads with typeof window === 'undefined'.
    expect(msalConfig.auth.redirectUri).toBe('/auth/redirect')
  })
})

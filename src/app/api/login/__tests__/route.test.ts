import { describe, it, expect, beforeEach, vi } from 'vitest'

const getAuthCodeUrlSpy = vi.fn()
vi.mock('@/auth/msalClient', () => ({
  getCca: () => ({ getAuthCodeUrl: getAuthCodeUrlSpy }),
}))
vi.mock('@/config/secrets', () => ({
  loadSecrets: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/config/env', () => ({
  env: () => ({ APP_BASE_URL: 'https://kb.example.com' }),
}))
vi.mock('@azure/msal-node', () => ({
  ResponseMode: { QUERY: 'query' },
}))

import { GET } from '../route'

describe('GET /api/login', () => {
  beforeEach(() => {
    getAuthCodeUrlSpy.mockReset()
  })

  it('redirects to the Entra authorize URL built by msal-node', async () => {
    getAuthCodeUrlSpy.mockResolvedValue(
      'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize?client_id=x',
    )
    const resp = await GET()
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe(
      'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize?client_id=x',
    )
  })

  it('passes scopes [openid profile email] to getAuthCodeUrl', async () => {
    getAuthCodeUrlSpy.mockResolvedValue('https://login.microsoftonline.com/x')
    await GET()
    expect(getAuthCodeUrlSpy).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ['openid', 'profile', 'email'] }),
    )
  })

  it('builds redirectUri from APP_BASE_URL with no trailing slash (Pitfall 4)', async () => {
    getAuthCodeUrlSpy.mockResolvedValue('https://login.microsoftonline.com/x')
    await GET()
    expect(getAuthCodeUrlSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'https://kb.example.com/api/auth/callback',
      }),
    )
  })

  it('coerces a path-only MSAL response to an absolute login.microsoftonline.com URL (Pitfall 13 — msal-node 5.1.4)', async () => {
    getAuthCodeUrlSpy.mockResolvedValue(
      '/some-tenant/oauth2/v2.0/authorize?client_id=x',
    )
    const resp = await GET()
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe(
      'https://login.microsoftonline.com/some-tenant/oauth2/v2.0/authorize?client_id=x',
    )
  })

  it('passes an already-absolute MSAL response through unchanged', async () => {
    getAuthCodeUrlSpy.mockResolvedValue(
      'https://login.microsoftonline.com/some-tenant/oauth2/v2.0/authorize?client_id=x',
    )
    const resp = await GET()
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe(
      'https://login.microsoftonline.com/some-tenant/oauth2/v2.0/authorize?client_id=x',
    )
  })
})

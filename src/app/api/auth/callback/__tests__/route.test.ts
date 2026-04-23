import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const acquireTokenByCodeSpy = vi.fn()
const saveSessionSpy = vi.fn()

vi.mock('@/auth/msalClient', () => ({
  getCca: () => ({ acquireTokenByCode: acquireTokenByCodeSpy }),
}))
// NOTE: saveSession is wrapped in a forwarding arrow so the vi.mock factory
// (which Vitest hoists above the top-level const declarations) does not try
// to read `saveSessionSpy` at module-init time. The forwarding fn is evaluated
// lazily on each call, by which point the spy has been initialised.
vi.mock('@/auth/session', () => ({
  saveSession: (...args: unknown[]) => saveSessionSpy(...args),
}))
vi.mock('@/config/secrets', () => ({
  loadSecrets: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/config/env', () => ({
  env: () => ({ APP_BASE_URL: 'https://kb.example.com' }),
}))

import { GET } from '../route'

function makeReq(query: string): NextRequest {
  return {
    nextUrl: new URL(`https://kb.example.com/api/auth/callback${query}`),
  } as NextRequest
}

describe('GET /api/auth/callback', () => {
  beforeEach(() => {
    acquireTokenByCodeSpy.mockReset()
    saveSessionSpy.mockReset()
  })

  it('happy path: exchanges code, saves session, redirects to /', async () => {
    acquireTokenByCodeSpy.mockResolvedValue({
      idTokenClaims: {
        oid: 'test-oid',
        preferred_username: 'test@mmc.com',
        name: 'Test User',
        roles: ['KbAssistant.User'],
      },
    })
    const resp = await GET(makeReq('?code=valid-code&state=valid-state'))
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe('https://kb.example.com/')
    expect(saveSessionSpy).toHaveBeenCalledWith({
      oid: 'test-oid',
      email: 'test@mmc.com',
      name: 'Test User',
      roles: ['KbAssistant.User'],
    })
  })

  it('roles undefined → empty array (Pitfall 5)', async () => {
    acquireTokenByCodeSpy.mockResolvedValue({
      idTokenClaims: {
        oid: 'test-oid',
        preferred_username: 'test@mmc.com',
        name: 'Test User',
        // roles absent
      },
    })
    await GET(makeReq('?code=valid-code'))
    expect(saveSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ roles: [] }),
    )
  })

  it('?error= query param → redirect to / without saveSession', async () => {
    const resp = await GET(makeReq('?error=access_denied'))
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe('https://kb.example.com/')
    expect(saveSessionSpy).not.toHaveBeenCalled()
    expect(acquireTokenByCodeSpy).not.toHaveBeenCalled()
  })

  it('missing code AND missing error → redirect to /api/login', async () => {
    const resp = await GET(makeReq(''))
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe('https://kb.example.com/api/login')
    expect(saveSessionSpy).not.toHaveBeenCalled()
  })

  it('acquireTokenByCode throws → redirect to /api/login (Pitfall 3 recovery)', async () => {
    acquireTokenByCodeSpy.mockRejectedValue(
      new Error('invalid_grant: state mismatch'),
    )
    const resp = await GET(makeReq('?code=stale-code'))
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe('https://kb.example.com/api/login')
    expect(saveSessionSpy).not.toHaveBeenCalled()
  })

  it('redirectUri passed to acquireTokenByCode matches /api/login construction (Pitfall 4)', async () => {
    acquireTokenByCodeSpy.mockResolvedValue({
      idTokenClaims: {
        oid: 'x',
        preferred_username: 'y@mmc.com',
        name: 'Y',
        roles: [],
      },
    })
    await GET(makeReq('?code=valid-code'))
    expect(acquireTokenByCodeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'https://kb.example.com/api/auth/callback',
      }),
    )
  })
})

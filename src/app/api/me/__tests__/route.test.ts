import { describe, it, expect, beforeEach, vi } from 'vitest'

type SessionShape = {
  user?: { oid: string; email: string; name: string; roles: string[] }
}

let sessionMock: SessionShape = {}
vi.mock('@/auth/session', () => ({
  getSession: async () => sessionMock,
}))
vi.mock('@/config/secrets', () => ({
  loadSecrets: vi.fn().mockResolvedValue({}),
}))

import { GET } from '../route'

describe('GET /api/me', () => {
  beforeEach(() => {
    sessionMock = {}
  })

  it('no session → 401 { error:"authentication_required" }', async () => {
    sessionMock = {}
    const resp = await GET()
    expect(resp.status).toBe(401)
    const body = await resp.json()
    expect(body).toEqual({ error: 'authentication_required' })
  })

  it('session without required role → 403 { error:"forbidden", upn }', async () => {
    sessionMock = {
      user: {
        oid: 'x',
        email: 'u@mmc.com',
        name: 'U',
        roles: ['SomeOtherRole'],
      },
    }
    const resp = await GET()
    expect(resp.status).toBe(403)
    const body = await resp.json()
    expect(body).toEqual({ error: 'forbidden', upn: 'u@mmc.com' })
  })

  it('session with KbAssistant.User role → 200 { displayName, email, oid, roles }', async () => {
    sessionMock = {
      user: {
        oid: 'oid-123',
        email: 'test@mmc.com',
        name: 'Test User',
        roles: ['KbAssistant.User'],
      },
    }
    const resp = await GET()
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body).toEqual({
      displayName: 'Test User',
      email: 'test@mmc.com',
      oid: 'oid-123',
      roles: ['KbAssistant.User'],
    })
  })

  it('session.user.roles undefined → treated as empty → 403 (Pitfall 5 defense)', async () => {
    sessionMock = {
      user: {
        oid: 'x',
        email: 'u@mmc.com',
        name: 'U',
        roles: undefined as unknown as string[],
      },
    }
    const resp = await GET()
    expect(resp.status).toBe(403)
  })

  it('all responses include Cache-Control: no-store', async () => {
    sessionMock = {}
    const resp = await GET()
    expect(resp.headers.get('cache-control')).toBe('no-store')
  })
})

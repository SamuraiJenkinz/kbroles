import { describe, it, expect, beforeEach, vi } from 'vitest'

const clearSessionSpy = vi.fn()
// Wrapped in a forwarding arrow so the hoisted vi.mock factory doesn't try
// to reference `clearSessionSpy` before it's initialised.
vi.mock('@/auth/session', () => ({
  clearSession: (...args: unknown[]) => clearSessionSpy(...args),
}))
vi.mock('@/config/secrets', () => ({
  loadSecrets: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/config/env', () => ({
  env: () => ({ APP_BASE_URL: 'https://kb.example.com' }),
}))

import { GET } from '../route'

describe('GET /api/logout', () => {
  beforeEach(() => {
    clearSessionSpy.mockReset()
  })

  it('calls clearSession() and redirects to /', async () => {
    const resp = await GET()
    expect(clearSessionSpy).toHaveBeenCalledOnce()
    expect(resp.status).toBe(307)
    expect(resp.headers.get('location')).toBe('https://kb.example.com/')
  })
})

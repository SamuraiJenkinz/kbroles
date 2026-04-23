import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock env() FIRST so getSessionOptions can read it.
const envMock = vi.fn(() => ({
  SESSION_SECRET: 'test-session-secret-32-chars-aaaaa',
}))
vi.mock('@/config/env', () => ({ env: () => envMock() }))

// Mock iron-session's getIronSession so we capture the cookieStore + options.
const getIronSessionSpy = vi.fn()
vi.mock('iron-session', () => ({
  getIronSession: (store: unknown, opts: unknown) => getIronSessionSpy(store, opts),
}))

// Mock next/headers cookies() — returns a marker object.
const cookiesMarker = { __mock: 'cookie-store' }
vi.mock('next/headers', () => ({
  cookies: async () => cookiesMarker,
}))

// Import UNDER TEST after mocks.
import {
  SESSION_COOKIE_NAME,
  getSessionOptions,
  getSession,
  saveSession,
  clearSession,
} from '../session'

describe('getSessionOptions', () => {
  beforeEach(() => {
    envMock.mockReset()
    envMock.mockImplementation(() => ({ SESSION_SECRET: 'test-session-secret-32-chars-aaaaa' }))
  })

  it('reads SESSION_SECRET from env() at call time (not module load)', () => {
    // First call: envMock has default return
    expect(getSessionOptions().password).toBe('test-session-secret-32-chars-aaaaa')
    // Change envMock return — next call reflects the change
    envMock.mockImplementationOnce(() => ({ SESSION_SECRET: 'different-secret-32-chars-xxxxxx' }))
    expect(getSessionOptions().password).toBe('different-secret-32-chars-xxxxxx')
  })

  it('cookieOptions defaults: httpOnly, sameSite=lax, path=/, maxAge 8h', () => {
    const opts = getSessionOptions()
    expect(opts.cookieName).toBe(SESSION_COOKIE_NAME)
    expect(opts.cookieOptions?.httpOnly).toBe(true)
    expect(opts.cookieOptions?.sameSite).toBe('lax')
    expect(opts.cookieOptions?.path).toBe('/')
    expect(opts.cookieOptions?.maxAge).toBe(60 * 60 * 8)
  })
})

describe('getSession / saveSession / clearSession', () => {
  beforeEach(() => {
    getIronSessionSpy.mockReset()
  })

  it('getSession awaits cookies() when no store is passed', async () => {
    getIronSessionSpy.mockReturnValue({ user: undefined, save: vi.fn(), destroy: vi.fn() })
    await getSession()
    expect(getIronSessionSpy).toHaveBeenCalledWith(cookiesMarker, expect.any(Object))
  })

  it('getSession passes the explicit cookieStore when provided', async () => {
    const explicitStore = { __explicit: true } as unknown as Awaited<
      ReturnType<typeof import('next/headers').cookies>
    >
    getIronSessionSpy.mockReturnValue({ user: undefined, save: vi.fn(), destroy: vi.fn() })
    await getSession(explicitStore)
    expect(getIronSessionSpy).toHaveBeenCalledWith(explicitStore, expect.any(Object))
  })

  it('saveSession assigns user and calls session.save()', async () => {
    const save = vi.fn()
    const session = { user: undefined as unknown, save, destroy: vi.fn() }
    getIronSessionSpy.mockReturnValue(session)
    await saveSession({
      oid: 'test-oid',
      email: 'test@mmc.com',
      name: 'Test User',
      roles: ['KbAssistant.User'],
    })
    expect(session.user).toEqual({
      oid: 'test-oid',
      email: 'test@mmc.com',
      name: 'Test User',
      roles: ['KbAssistant.User'],
    })
    expect(save).toHaveBeenCalledOnce()
  })

  it('clearSession calls session.destroy()', async () => {
    const destroy = vi.fn()
    getIronSessionSpy.mockReturnValue({ user: { oid: 'x' }, save: vi.fn(), destroy })
    await clearSession()
    expect(destroy).toHaveBeenCalledOnce()
  })
})

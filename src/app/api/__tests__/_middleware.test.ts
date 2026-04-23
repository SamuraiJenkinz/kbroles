import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// --- Phase-5.1 Plan 04 Task 1: session-cookie auth validator ----------------
//
// Pattern: REPLACES the Phase-5 jose+mock-jwks JWT test pattern. The
// _middleware now reads the iron-session cookie via `getSession(cookieStore)`
// instead of validating a Bearer JWT against Entra's JWKS per request. We
// mock `next/headers`'s `cookies()` and `@/auth/session`'s `getSession` so
// tests can inject the four distinct session states without spinning up
// iron-session's real Node crypto path.

type SessionShape = {
  user?: { oid: string; email: string; name: string; roles: string[] }
}

// Shared mutable state the mocks read from. Each test sets these two
// variables in its `arrange` section; beforeEach resets them.
let sessionMock: SessionShape = {}
let cookieGetResult: { name: string; value: string } | undefined = undefined

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (_name: string) => cookieGetResult,
  }),
}))

vi.mock('@/auth/session', () => ({
  getSession: async () => sessionMock,
  SESSION_COOKIE_NAME: 'kb_session',
}))

// Import UNDER TEST after mocks. vi.mock is hoisted above this import, so
// the _middleware module sees the mocked next/headers + session modules.
import { getRequestUser } from '../_middleware'

function makeRequest(): Request {
  return new Request('https://kb.example.com/api/chat')
}

describe('getRequestUser — iron-session cookie validator', () => {
  const origNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    sessionMock = {}
    cookieGetResult = undefined
    vi.stubEnv('NODE_ENV', 'test')
  })

  afterEach(() => {
    vi.stubEnv('NODE_ENV', origNodeEnv ?? 'test')
  })

  it('dev + no session cookie → local-dev stub with required role (Phase 2/3/4 regression guard)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    cookieGetResult = undefined
    sessionMock = {}

    const result = await getRequestUser(makeRequest())

    expect(result).toEqual({
      sub: 'local-dev',
      email: 'local@dev',
      roles: ['KbAssistant.User'],
    })
  })

  it('production + no session cookie → { error: "unauthorized" }', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    cookieGetResult = undefined
    sessionMock = {}

    const result = await getRequestUser(makeRequest())

    expect(result).toEqual({ error: 'unauthorized' })
  })

  it('production + session cookie PRESENT but session.user undefined → { error: "session_expired" }', async () => {
    // Distinguishes "cookie too old / tampered / wrong SESSION_SECRET" (→
    // session_expired → wire `token_expired`) from "never signed in" (→
    // unauthorized). Frontend uses the split to pick 'Sign back in' CTA
    // wording vs first-time sign-in prompt.
    vi.stubEnv('NODE_ENV', 'production')
    cookieGetResult = { name: 'kb_session', value: 'tampered-or-expired' }
    sessionMock = {}

    const result = await getRequestUser(makeRequest())

    expect(result).toEqual({ error: 'session_expired' })
  })

  it('valid session with required role → { sub, email, roles }', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    cookieGetResult = { name: 'kb_session', value: 'valid' }
    sessionMock = {
      user: {
        oid: 'oid-123',
        email: 'alice@mmc.com',
        name: 'Alice',
        roles: ['KbAssistant.User'],
      },
    }

    const result = await getRequestUser(makeRequest())

    expect(result).toEqual({
      sub: 'oid-123',
      email: 'alice@mmc.com',
      roles: ['KbAssistant.User'],
    })
  })

  it('valid session WITHOUT required role → { error: "forbidden", upn }', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    cookieGetResult = { name: 'kb_session', value: 'valid' }
    sessionMock = {
      user: {
        oid: 'oid-456',
        email: 'bob@mmc.com',
        name: 'Bob',
        roles: ['SomeOtherRole'],
      },
    }

    const result = await getRequestUser(makeRequest())

    expect(result).toEqual({ error: 'forbidden', upn: 'bob@mmc.com' })
  })

  it('valid session with roles=undefined → { error: "forbidden" } (Pitfall 5 — Entra omits empty roles)', async () => {
    // Entra ID omits the `roles` claim entirely (not an empty array — an
    // undefined field) when a user has no app-role assignments. `roles ??
    // []` in _middleware must coerce so `.includes()` returns false rather
    // than throwing.
    vi.stubEnv('NODE_ENV', 'production')
    cookieGetResult = { name: 'kb_session', value: 'valid' }
    sessionMock = {
      user: {
        oid: 'oid-789',
        email: 'carol@mmc.com',
        name: 'Carol',
        roles: undefined as unknown as string[],
      },
    }

    const result = await getRequestUser(makeRequest())

    expect(result).toEqual({ error: 'forbidden', upn: 'carol@mmc.com' })
  })

  it('dev + session cookie with valid user → returns real user (NOT the dev stub)', async () => {
    // The dev-permissive stub only fires when there is NO cookie. Once a
    // session exists, real auth runs even in dev — required for a developer
    // testing the /api/login → /api/auth/callback flow locally without
    // accidentally getting the `local-dev` subject.
    vi.stubEnv('NODE_ENV', 'development')
    cookieGetResult = { name: 'kb_session', value: 'valid' }
    sessionMock = {
      user: {
        oid: 'dev-real-oid',
        email: 'dev.real@mmc.com',
        name: 'Dev',
        roles: ['KbAssistant.User'],
      },
    }

    const result = await getRequestUser(makeRequest())

    expect(result).toEqual({
      sub: 'dev-real-oid',
      email: 'dev.real@mmc.com',
      roles: ['KbAssistant.User'],
    })
  })
})

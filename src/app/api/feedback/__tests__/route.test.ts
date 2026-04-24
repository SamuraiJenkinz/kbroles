import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Session mock ─────────────────────────────────────────────────────────────
// Inject session state without spinning up iron-session's real Node crypto.
// Pattern mirrors src/app/api/__tests__/_middleware.test.ts.

type SessionShape = {
  user?: { oid: string; email: string; name: string; roles: string[] }
}

let sessionMock: SessionShape = {}

vi.mock('@/auth/session', () => ({
  getSession: async () => sessionMock,
  getSessionIdHash: (s: SessionShape) => (s.user?.oid ? 'hash-oid-test' : undefined),
  getUserIdHash: (s: SessionShape) => (s.user?.email ? 'hash-email-test' : undefined),
  SESSION_COOKIE_NAME: 'kb_session',
}))

// ─── Telemetry spy ────────────────────────────────────────────────────────────
const trackEventSpy = vi.fn()

vi.mock('@/obs/telemetry', () => ({
  trackEvent: (...args: unknown[]) => trackEventSpy(...args),
}))

// ─── Logger mock ──────────────────────────────────────────────────────────────
vi.mock('@/obs/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  requestLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }),
}))

import { POST } from '../route'

const VALID_UUID = '00000000-0000-4000-8000-000000000001'

const AUTHED_USER = {
  oid: 'oid-test',
  email: 'user@mmc.com',
  name: 'Test User',
  roles: ['KbAssistant.User'],
}

function makeRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request('https://kb.test/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    sessionMock = {}
    trackEventSpy.mockClear()
  })

  it('401 when no session (unauthenticated)', async () => {
    sessionMock = {} // no user
    const res = await POST(makeRequest({ message_id: VALID_UUID, rating: 'up' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthenticated')
    expect(trackEventSpy).not.toHaveBeenCalled()
  })

  it('400 on missing message_id', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(makeRequest({ rating: 'up' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_payload')
    expect(trackEventSpy).not.toHaveBeenCalled()
  })

  it('400 on invalid UUID (non-UUID message_id)', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(makeRequest({ message_id: 'not-a-uuid', rating: 'up' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_payload')
    expect(trackEventSpy).not.toHaveBeenCalled()
  })

  it('400 on rating outside {up, down}', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(makeRequest({ message_id: VALID_UUID, rating: 'meh' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_payload')
    expect(trackEventSpy).not.toHaveBeenCalled()
  })

  it('200 happy path (thumbs up) — calls trackEvent with thumbs_rating', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(
      makeRequest({ message_id: VALID_UUID, rating: 'up' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    expect(trackEventSpy).toHaveBeenCalledOnce()
    const [eventName, dims] = trackEventSpy.mock.calls[0]
    expect(eventName).toBe('thumbs_rating')
    expect(dims.message_id).toBe(VALID_UUID)
    expect(dims.rating).toBe('up')
    expect(dims.session_id_hash).toBe('hash-oid-test')
    expect(dims.user_id_hash).toBe('hash-email-test')
  })

  it('200 happy path (thumbs down with reason + citation ids) — full FDBK-03 payload', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(
      makeRequest({
        message_id: VALID_UUID,
        rating: 'down',
        reason: 'wrong citation',
        citation_source_id: 'KB0022991',
        citation_section_id: 'flagging-articles',
      }),
    )
    expect(res.status).toBe(200)

    expect(trackEventSpy).toHaveBeenCalledOnce()
    const [eventName, dims] = trackEventSpy.mock.calls[0]
    expect(eventName).toBe('thumbs_rating')
    expect(dims.rating).toBe('down')
    expect(dims.reason).toBe('wrong citation')
    expect(dims.citation_source_id).toBe('KB0022991')
    expect(dims.citation_section_id).toBe('flagging-articles')
  })

  it('200 with reason: other — additional root-level props from body are not emitted', async () => {
    sessionMock = { user: AUTHED_USER }
    // Extra property at root that should NOT appear in trackEvent dims
    const res = await POST(
      makeRequest({
        message_id: VALID_UUID,
        rating: 'down',
        reason: 'other',
        extra_evil_field: 'raw-user-text',
      }),
    )
    expect(res.status).toBe(200)
    const [, dims] = trackEventSpy.mock.calls[0]
    expect(dims).not.toHaveProperty('extra_evil_field')
    expect(dims.reason).toBe('other')
  })
})

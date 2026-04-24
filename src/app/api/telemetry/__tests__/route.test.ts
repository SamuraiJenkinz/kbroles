import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Session mock ─────────────────────────────────────────────────────────────

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

// ─── Logger spy (capture pino warn calls for PII-strip test) ─────────────────
const loggerWarnSpy = vi.fn()

vi.mock('@/obs/logger', () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnSpy(...args), info: vi.fn(), error: vi.fn() },
  requestLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }),
}))

import { POST } from '../route'

const VALID_UUID = '00000000-0000-4000-8000-000000000002'

const AUTHED_USER = {
  oid: 'oid-test',
  email: 'user@mmc.com',
  name: 'Test User',
  roles: ['KbAssistant.User'],
}

function makeRequest(body: unknown): Request {
  return new Request('https://kb.test/api/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/telemetry', () => {
  beforeEach(() => {
    sessionMock = {}
    trackEventSpy.mockClear()
    loggerWarnSpy.mockClear()
  })

  it('401 when no session cookie (unauthenticated)', async () => {
    sessionMock = {}
    const res = await POST(
      makeRequest({ name: 'citation_click_through', message_id: VALID_UUID }),
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthenticated')
    expect(trackEventSpy).not.toHaveBeenCalled()
  })

  it('400 on unknown event name (not whitelisted)', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(
      makeRequest({ name: 'not_whitelisted', message_id: VALID_UUID }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_payload')
    expect(trackEventSpy).not.toHaveBeenCalled()
  })

  it('200 on citation_click_through with source_id + section_id', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(
      makeRequest({
        name: 'citation_click_through',
        message_id: VALID_UUID,
        dimensions: { source_id: 'KB0022991', section_id: 'flagging-articles' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    expect(trackEventSpy).toHaveBeenCalledOnce()
    const [eventName, dims] = trackEventSpy.mock.calls[0]
    expect(eventName).toBe('citation_click_through')
    expect(dims.source_id).toBe('KB0022991')
    expect(dims.section_id).toBe('flagging-articles')
    expect(dims.message_id).toBe(VALID_UUID)
    expect(dims.session_id_hash).toBe('hash-oid-test')
  })

  it('200 on flag_a_gap_action', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(
      makeRequest({
        name: 'flag_a_gap_action',
        message_id: VALID_UUID,
        dimensions: { question_hash: 'abc123def456789a' },
      }),
    )
    expect(res.status).toBe(200)

    expect(trackEventSpy).toHaveBeenCalledOnce()
    const [eventName, dims] = trackEventSpy.mock.calls[0]
    expect(eventName).toBe('flag_a_gap_action')
    expect(dims.question_hash).toBe('abc123def456789a')
  })

  it('PII-key defence: strips "email" from dimensions and emits logger.warn', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(
      makeRequest({
        name: 'citation_click_through',
        message_id: VALID_UUID,
        dimensions: { email: 'hacker@evil.com', source_id: 'KB0022991' },
      }),
    )
    expect(res.status).toBe(200)

    const [, dims] = trackEventSpy.mock.calls[0]
    // PII key must NOT appear in emitted dimensions
    expect(dims).not.toHaveProperty('email')
    // Safe key passes through
    expect(dims.source_id).toBe('KB0022991')

    // logger.warn was called with stripped keys info
    expect(loggerWarnSpy).toHaveBeenCalled()
    const warnCall = loggerWarnSpy.mock.calls[0]
    expect(warnCall[0]).toMatchObject({ stripped_keys: expect.arrayContaining(['email']) })
  })

  it('PII-key defence: strips all known PII keys (upn, content, answer, quote, user)', async () => {
    sessionMock = { user: AUTHED_USER }
    const res = await POST(
      makeRequest({
        name: 'flag_a_gap_action',
        message_id: VALID_UUID,
        dimensions: {
          upn: 'user@mmc.com',
          content: 'raw answer text',
          answer: 'raw answer',
          quote: 'verbatim excerpt',
          user: 'user-display-name',
          question_hash: 'safevalue123',
        },
      }),
    )
    expect(res.status).toBe(200)

    const [, dims] = trackEventSpy.mock.calls[0]
    expect(dims).not.toHaveProperty('upn')
    expect(dims).not.toHaveProperty('content')
    expect(dims).not.toHaveProperty('answer')
    expect(dims).not.toHaveProperty('quote')
    expect(dims).not.toHaveProperty('user')
    expect(dims.question_hash).toBe('safevalue123')
  })
})

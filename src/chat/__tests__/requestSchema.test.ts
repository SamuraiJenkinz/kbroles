import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseChatRequest } from '@/chat/requestSchema'
import { __resetEnvCacheForTests } from '@/config/env'

// parseChatRequest reads env().MAX_MESSAGES and env().MAX_MESSAGE_CHARS on
// every call. Ensure env() has a valid snapshot for each test — the
// defaults (20 messages, 8000 chars) are what the locked error codes were
// specified against in 02-CONTEXT §4.1.
beforeEach(() => {
  process.env.LLM_AUTH_MODE = 'bearer'
  process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
  process.env.LLM_API_KEY   = 'test-key'
  process.env.LLM_MODEL     = 'gpt-4o'
  delete process.env.MAX_MESSAGES
  delete process.env.MAX_MESSAGE_CHARS
  __resetEnvCacheForTests()
})

afterEach(() => {
  __resetEnvCacheForTests()
})

describe('parseChatRequest — locked error codes (02-CONTEXT §4.1)', () => {
  it('returns role_missing for an empty body', () => {
    expect(parseChatRequest({})).toEqual({ ok: false, code: 'role_missing' })
  })

  it('returns role_invalid for an out-of-enum role', () => {
    const out = parseChatRequest({ role: 'admin', messages: [{ role: 'user', content: 'hi' }] })
    expect(out).toEqual({ ok: false, code: 'role_invalid' })
  })

  it('returns messages_missing when messages is absent', () => {
    expect(parseChatRequest({ role: 'consumer' })).toEqual({ ok: false, code: 'messages_missing' })
  })

  it('returns messages_empty for an empty array', () => {
    expect(parseChatRequest({ role: 'consumer', messages: [] }))
      .toEqual({ ok: false, code: 'messages_empty' })
  })

  it('returns message_role_invalid for an unknown per-message role', () => {
    const out = parseChatRequest({
      role: 'consumer',
      messages: [{ role: 'bot', content: 'hi' }],
    })
    expect(out).toEqual({ ok: false, code: 'message_role_invalid' })
  })

  it('returns message_content_invalid for a non-string content', () => {
    const out = parseChatRequest({
      role: 'consumer',
      messages: [{ role: 'user', content: 42 }],
    })
    expect(out).toEqual({ ok: false, code: 'message_content_invalid' })
  })

  it('returns history_cap_exceeded when messages exceed MAX_MESSAGES (default 20)', () => {
    const messages = Array.from({ length: 21 }, () => ({ role: 'user' as const, content: 'x' }))
    const out = parseChatRequest({ role: 'consumer', messages })
    expect(out).toEqual({ ok: false, code: 'history_cap_exceeded' })
  })

  it('returns message_too_long when any content exceeds MAX_MESSAGE_CHARS (default 8000)', () => {
    const out = parseChatRequest({
      role: 'consumer',
      messages: [{ role: 'user', content: 'x'.repeat(9000) }],
    })
    expect(out).toEqual({ ok: false, code: 'message_too_long' })
  })
})

describe('parseChatRequest — happy path', () => {
  it('returns ok=true with the typed request data when all fields are valid', () => {
    const body = { role: 'author', messages: [{ role: 'user', content: 'Hi' }] }
    const out = parseChatRequest(body)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.data.role).toBe('author')
      expect(out.data.messages).toHaveLength(1)
      expect(out.data.messages[0]).toEqual({ role: 'user', content: 'Hi' })
    }
  })

  it('accepts consumer + multiple messages up to the cap', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `message ${i}`,
    }))
    const out = parseChatRequest({ role: 'consumer', messages })
    expect(out.ok).toBe(true)
  })

  it('accepts messages at exactly MAX_MESSAGE_CHARS length', () => {
    const out = parseChatRequest({
      role: 'consumer',
      messages: [{ role: 'user', content: 'x'.repeat(8000) }],
    })
    expect(out.ok).toBe(true)
  })
})

describe('parseChatRequest — malformed inputs', () => {
  it('returns messages_missing for null body', () => {
    expect(parseChatRequest(null)).toEqual({ ok: false, code: 'messages_missing' })
  })

  it('returns messages_missing for a string body', () => {
    expect(parseChatRequest('not an object')).toEqual({ ok: false, code: 'messages_missing' })
  })

  it('returns messages_missing for an array body (not the expected object)', () => {
    expect(parseChatRequest([])).toEqual({ ok: false, code: 'messages_missing' })
  })
})

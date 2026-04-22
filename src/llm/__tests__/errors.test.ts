import { describe, it, expect } from 'vitest'
import {
  UpstreamTimeoutError,
  Upstream5xxError,
  SchemaRejectAfterRetryError,
  RefusalError,
  UpstreamAuthError,
  isRetryableUpstream,
} from '@/llm/errors'

describe('typed upstream error classes — name discriminators', () => {
  it('UpstreamTimeoutError.name is the literal discriminator', () => {
    const e = new UpstreamTimeoutError()
    expect(e.name).toBe('UpstreamTimeoutError')
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('Upstream timed out')
  })

  it('UpstreamTimeoutError accepts custom message', () => {
    const e = new UpstreamTimeoutError('45s exceeded')
    expect(e.message).toBe('45s exceeded')
  })

  it('Upstream5xxError carries status and default message', () => {
    const e = new Upstream5xxError(502)
    expect(e.name).toBe('Upstream5xxError')
    expect(e.status).toBe(502)
    expect(e.message).toBe('Upstream 502')
  })

  it('Upstream5xxError accepts custom message', () => {
    const e = new Upstream5xxError(503, 'gateway unavailable')
    expect(e.status).toBe(503)
    expect(e.message).toBe('gateway unavailable')
  })

  it('SchemaRejectAfterRetryError preserves .cause diagnostic chain', () => {
    const inner = new Error('Ajv validation failed: missing citations')
    const e = new SchemaRejectAfterRetryError(inner)
    expect(e.name).toBe('SchemaRejectAfterRetryError')
    expect(e.cause).toBe(inner)
    expect(e.message).toBe('Schema rejected after retry')
  })

  it('RefusalError exposes the raw refusal payload and truncates message', () => {
    const long = 'policy violation '.repeat(20) // 320 chars
    const e = new RefusalError(long)
    expect(e.name).toBe('RefusalError')
    expect(e.refusal).toBe(long) // full payload preserved
    expect(e.message.length).toBeLessThan(120) // truncated for logs
    expect(e.message).toContain('Model refused:')
  })

  it('UpstreamAuthError narrows status to 401 | 403', () => {
    const e401 = new UpstreamAuthError(401)
    expect(e401.name).toBe('UpstreamAuthError')
    expect(e401.status).toBe(401)
    expect(e401.message).toBe('Upstream auth 401')
    const e403 = new UpstreamAuthError(403)
    expect(e403.status).toBe(403)
  })
})

describe('isRetryableUpstream — classifier', () => {
  it('returns true for retryable HTTP statuses 429, 502, 503, 504', () => {
    expect(isRetryableUpstream({ status: 429 })).toBe(true)
    expect(isRetryableUpstream({ status: 502 })).toBe(true)
    expect(isRetryableUpstream({ status: 503 })).toBe(true)
    expect(isRetryableUpstream({ status: 504 })).toBe(true)
  })

  it('returns false for non-retryable HTTP statuses 400, 401, 403, 422, 500', () => {
    expect(isRetryableUpstream({ status: 400 })).toBe(false)
    expect(isRetryableUpstream({ status: 401 })).toBe(false)
    expect(isRetryableUpstream({ status: 403 })).toBe(false)
    expect(isRetryableUpstream({ status: 422 })).toBe(false)
    // 500 is NOT in the retry list — only 502/503/504 are.
    expect(isRetryableUpstream({ status: 500 })).toBe(false)
  })

  it('returns true for network codes at top level', () => {
    expect(isRetryableUpstream({ code: 'ECONNRESET' })).toBe(true)
    expect(isRetryableUpstream({ code: 'ETIMEDOUT' })).toBe(true)
    expect(isRetryableUpstream({ code: 'UND_ERR_SOCKET' })).toBe(true)
  })

  it('returns true for network codes nested under .cause.code (undici wrap)', () => {
    expect(isRetryableUpstream({ cause: { code: 'ECONNRESET' } })).toBe(true)
    expect(isRetryableUpstream({ cause: { code: 'ETIMEDOUT' } })).toBe(true)
  })

  it('returns false for unknown codes', () => {
    expect(isRetryableUpstream({ code: 'EUNKNOWN' })).toBe(false)
    expect(isRetryableUpstream({ cause: { code: 'EHOSTUNREACH' } })).toBe(false)
  })

  it('returns false for falsy / non-object inputs', () => {
    expect(isRetryableUpstream(null)).toBe(false)
    expect(isRetryableUpstream(undefined)).toBe(false)
    expect(isRetryableUpstream({})).toBe(false)
    expect(isRetryableUpstream('ECONNRESET')).toBe(false)
    expect(isRetryableUpstream(429)).toBe(false)
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AsyncSemaphore, chatSemaphore, __resetForTests } from '@/chat/concurrency'
import { __resetEnvCacheForTests } from '@/config/env'

const originalEnv = { ...process.env }

describe('AsyncSemaphore — construction', () => {
  it('rejects a count of 0 with RangeError', () => {
    expect(() => new AsyncSemaphore(0)).toThrow(RangeError)
  })

  it('rejects a negative count with RangeError', () => {
    expect(() => new AsyncSemaphore(-1)).toThrow(RangeError)
  })
})

describe('AsyncSemaphore — tryAcquire / release semantics', () => {
  it('returns true until the cap is exhausted, then false', () => {
    const sem = new AsyncSemaphore(2)
    expect(sem.tryAcquire()).toBe(true)
    expect(sem.tryAcquire()).toBe(true)
    expect(sem.tryAcquire()).toBe(false)
  })

  it('release() restores one permit so the next tryAcquire succeeds', () => {
    const sem = new AsyncSemaphore(1)
    expect(sem.tryAcquire()).toBe(true)
    expect(sem.tryAcquire()).toBe(false)
    sem.release()
    expect(sem.tryAcquire()).toBe(true)
  })

  it('release() from a fully-available state never lifts count above the initial cap', () => {
    const sem = new AsyncSemaphore(2)
    expect(sem.available).toBe(2)
    sem.release() // stray release — count must NOT become 3
    sem.release()
    expect(sem.available).toBe(2)
    // Confirmation: only 2 acquisitions are possible.
    expect(sem.tryAcquire()).toBe(true)
    expect(sem.tryAcquire()).toBe(true)
    expect(sem.tryAcquire()).toBe(false)
  })

  it('release() with no waiters simply increments — observable via subsequent acquire', () => {
    const sem = new AsyncSemaphore(1)
    sem.tryAcquire() // count = 0, no waiters
    sem.release()   // increments back to 1
    expect(sem.tryAcquire()).toBe(true)
  })
})

describe('chatSemaphore — singleton sourced from env', () => {
  beforeEach(() => {
    // Ensure env() has a valid snapshot for the singleton's first read.
    // We construct a minimal test env from scratch — do not inherit stray
    // values from the shell or a loaded .env.local that might override
    // MAX_INFLIGHT_STREAMS unintentionally.
    process.env.LLM_AUTH_MODE = 'bearer'
    process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
    process.env.LLM_API_KEY   = 'test-key'
    process.env.LLM_MODEL     = 'gpt-4o'
    delete process.env.MAX_INFLIGHT_STREAMS
    __resetEnvCacheForTests()
    __resetForTests()
  })

  afterEach(() => {
    // Restore the original env snapshot and invalidate the env cache.
    // Do NOT call __resetForTests() here — it would re-invoke env() against
    // the restored env, which may lack LLM_* vars at test-run entry. The
    // next test's beforeEach sets a fresh env + resets the singleton.
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
    __resetEnvCacheForTests()
  })

  it('reads the initial cap from env().MAX_INFLIGHT_STREAMS (default 20)', () => {
    // Default is 20; the singleton should expose 20 available permits when
    // nothing has been acquired yet.
    expect(chatSemaphore.available).toBe(20)
  })

  it('__resetForTests(count) reconstructs with a custom cap for isolation', () => {
    __resetForTests(3)
    expect(chatSemaphore.available).toBe(3)
    chatSemaphore.tryAcquire()
    chatSemaphore.tryAcquire()
    expect(chatSemaphore.available).toBe(1)
    __resetForTests(3)
    expect(chatSemaphore.available).toBe(3)
  })
})

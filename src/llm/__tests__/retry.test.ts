import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamAnswer, type ChatMessage } from '@/llm/stream'
import { Upstream5xxError, UpstreamAuthError } from '@/llm/errors'
import { __resetEnvCacheForTests } from '@/config/env'
import type OpenAI from 'openai'

/**
 * Plan 2-03 Task 3.2 — bounded retry wrapper tests.
 *
 * We exercise the retry loop through streamAnswer (not a direct withRetry
 * import) because withRetry is module-private by design — the retry policy
 * is an implementation detail of streamAnswer, and tests should assert the
 * observable contract (call count, timing, thrown error types) rather than
 * the private helper. Mock client returns pre-scripted errors keyed to
 * attempt index; Math.random is stubbed to 0.5 for deterministic jitter.
 */

const ORIGINAL_ENV = { ...process.env }

const VALID_RESPONSE_JSON = JSON.stringify({
  can_answer: true,
  answer: 'Click Flag Article.',
  citations: [{
    source_id: 'KB0022991',
    section_id: 'flagging-articles',
    quote: 'Click the Flag Article button',
  }],
})

interface MockStep {
  /** If set, create() throws this error instead of returning. */
  throws?: { status?: number; code?: string; cause?: { code?: string }; message?: string }
  /** JSON body for the content field when not throwing. */
  content?: string
}

function makeMockClient(steps: MockStep[]): { client: OpenAI; calls: number } {
  let idx = 0
  const state = { calls: 0 }
  const client = {
    chat: {
      completions: {
        create: vi.fn(async () => {
          state.calls++
          const step = steps[idx++]
          if (!step) throw new Error(`mock exhausted at attempt ${idx}`)
          if (step.throws) {
            const err = new Error(step.throws.message ?? 'mock error') as Error & {
              status?: number
              code?: string
              cause?: { code?: string }
            }
            if (step.throws.status !== undefined) err.status = step.throws.status
            if (step.throws.code !== undefined) err.code = step.throws.code
            if (step.throws.cause !== undefined) err.cause = step.throws.cause
            throw err
          }
          return {
            choices: [{ message: { content: step.content ?? VALID_RESPONSE_JSON } }],
          }
        }),
      },
    },
  } as unknown as OpenAI
  return { client, get calls() { return state.calls } } as unknown as { client: OpenAI; calls: number }
}

/**
 * Helper: run streamAnswer with fake timers advancing setTimeout chains so
 * backoff delays don't block the test. vi.advanceTimersByTimeAsync is used
 * inside a microtask loop to drain all pending setTimeout callbacks.
 *
 * Attach a pre-emptive catch handler so Node.js does not raise an
 * unhandledRejection warning in the gap between the promise being created
 * and the test code awaiting it. Tests still observe the final rejection
 * via the returned promise.
 */
async function runWithFakeTimers<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn()
  // Swallow the warning by attaching a silent catch — the real rejection
  // still propagates through `promise` below (Promises cache both states).
  promise.catch(() => { /* caught below */ })
  // Drain any pending setTimeout callbacks in a loop — each attempt may
  // schedule a new timer, so we keep advancing until there's nothing left.
  // Total backoff window for max=5, base=500, jitter=0 is 500+1000+2000+4000+8000 = 15500ms.
  // Advancing by 20_000 in one shot covers all realistic cases.
  await vi.advanceTimersByTimeAsync(20_000)
  return promise
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  process.env.LLM_AUTH_MODE = 'bearer'
  process.env.LLM_BASE_URL  = 'https://api.openai.com/v1'
  process.env.LLM_API_KEY   = 'sk-test'
  process.env.LLM_MODEL     = 'gpt-4o-2024-08-06'
  delete process.env.STRICT_SCHEMA_SUPPORTED
  // Default retry config for most tests (3 total attempts).
  process.env.UPSTREAM_RETRY_MAX       = '2'
  process.env.UPSTREAM_RETRY_BASE_MS   = '500'
  process.env.UPSTREAM_RETRY_JITTER_MS = '250'
  __resetEnvCacheForTests()
  // Deterministic jitter: Math.random() = 0.5 → (0.5*2-1) = 0 → zero jitter.
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  __resetEnvCacheForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('withRetry — retryable failures succeed within the budget', () => {
  it('retries on 429 exactly twice, succeeds on third attempt', async () => {
    vi.useFakeTimers()
    const { client, calls: _callsRef } = makeMockClient([
      { throws: { status: 429 } },
      { throws: { status: 429 } },
      { content: VALID_RESPONSE_JSON },
    ]) as unknown as { client: OpenAI; calls: number }
    const messages: ChatMessage[] = [{ role: 'user', content: 'q' }]
    const result = await runWithFakeTimers(() =>
      streamAnswer({ client, systemPrompt: 'sys', messages, strictSchemaSupported: true }),
    )
    // Observable contract: create() called 3 times; response returned
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3)
    expect(result.response.can_answer).toBe(true)
  })

  it('retries on mixed 502 + 503 + success in 3 attempts', async () => {
    vi.useFakeTimers()
    const { client } = makeMockClient([
      { throws: { status: 502 } },
      { throws: { status: 503 } },
      { content: VALID_RESPONSE_JSON },
    ]) as unknown as { client: OpenAI; calls: number }
    const result = await runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3)
    expect(result.response.can_answer).toBe(true)
  })

  it('retries on ECONNRESET (network error at top level) + success on 2nd attempt', async () => {
    vi.useFakeTimers()
    const { client } = makeMockClient([
      { throws: { code: 'ECONNRESET' } },
      { content: VALID_RESPONSE_JSON },
    ]) as unknown as { client: OpenAI; calls: number }
    const result = await runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    expect(result.response.can_answer).toBe(true)
  })

  it('retries on ECONNRESET nested under .cause (undici wrap shape)', async () => {
    vi.useFakeTimers()
    const { client } = makeMockClient([
      { throws: { cause: { code: 'ECONNRESET' } } },
      { content: VALID_RESPONSE_JSON },
    ]) as unknown as { client: OpenAI; calls: number }
    const result = await runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    expect(result.response.can_answer).toBe(true)
  })
})

describe('withRetry — exhausting the budget', () => {
  it('retries 502 three times (all fail) → throws Upstream5xxError with .status=502', async () => {
    vi.useFakeTimers()
    const { client } = makeMockClient([
      { throws: { status: 502 } },
      { throws: { status: 502 } },
      { throws: { status: 502 } },
    ]) as unknown as { client: OpenAI; calls: number }
    await expect(runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(Upstream5xxError)
      expect((err as Upstream5xxError).status).toBe(502)
      return true
    })
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3)
  })

  it('retries 429 three times (all fail) → throws Upstream5xxError with .status=429', async () => {
    vi.useFakeTimers()
    const { client } = makeMockClient([
      { throws: { status: 429 } },
      { throws: { status: 429 } },
      { throws: { status: 429 } },
    ]) as unknown as { client: OpenAI; calls: number }
    await expect(runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(Upstream5xxError)
      expect((err as Upstream5xxError).status).toBe(429)
      return true
    })
  })
})

describe('withRetry — non-retryable failures propagate immediately', () => {
  it('400 throws immediately on first attempt (no retries)', async () => {
    vi.useFakeTimers()
    const { client } = makeMockClient([
      { throws: { status: 400 } },
    ]) as unknown as { client: OpenAI; calls: number }
    await expect(runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )).rejects.toSatisfy((err: unknown) => {
      expect((err as { status?: number }).status).toBe(400)
      return true
    })
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('401 throws UpstreamAuthError(401) immediately (reclassified non-retryable)', async () => {
    vi.useFakeTimers()
    const { client } = makeMockClient([
      { throws: { status: 401 } },
    ]) as unknown as { client: OpenAI; calls: number }
    await expect(runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(UpstreamAuthError)
      expect((err as UpstreamAuthError).status).toBe(401)
      return true
    })
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('403 throws UpstreamAuthError(403) immediately', async () => {
    vi.useFakeTimers()
    const { client } = makeMockClient([
      { throws: { status: 403 } },
    ]) as unknown as { client: OpenAI; calls: number }
    await expect(runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(UpstreamAuthError)
      expect((err as UpstreamAuthError).status).toBe(403)
      return true
    })
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('422 throws immediately (not reclassified, just propagated)', async () => {
    vi.useFakeTimers()
    const { client } = makeMockClient([
      { throws: { status: 422 } },
    ]) as unknown as { client: OpenAI; calls: number }
    await expect(runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )).rejects.toSatisfy((err: unknown) => {
      expect((err as { status?: number }).status).toBe(422)
      expect(err).not.toBeInstanceOf(UpstreamAuthError)
      return true
    })
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })
})

describe('withRetry — backoff timing (fake timers + Math.random=0.5 for zero jitter)', () => {
  it('first retry waits baseMs=500ms; second retry waits 2*baseMs=1000ms', async () => {
    vi.useFakeTimers()
    // Override jitter to a non-zero value to prove random=0.5 → zero jitter.
    process.env.UPSTREAM_RETRY_JITTER_MS = '250'
    __resetEnvCacheForTests()
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // (0.5*2-1)*250 = 0

    const { client } = makeMockClient([
      { throws: { status: 502 } },
      { throws: { status: 502 } },
      { content: VALID_RESPONSE_JSON },
    ]) as unknown as { client: OpenAI; calls: number }

    const promise = streamAnswer({
      client, systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
      strictSchemaSupported: true,
    })

    // After 499ms: still in first backoff window — only 1 call made so far.
    await vi.advanceTimersByTimeAsync(499)
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)

    // Cross the 500ms threshold → second attempt fires.
    await vi.advanceTimersByTimeAsync(2)
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)

    // After 999 more ms (total 1501ms since first call): still in second backoff window.
    await vi.advanceTimersByTimeAsync(998)
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)

    // Cross the 1000ms second-backoff threshold → third attempt fires.
    await vi.advanceTimersByTimeAsync(2)
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3)

    const result = await promise
    expect(result.response.can_answer).toBe(true)
  })

  it('backoff respects env overrides (base=200 → call 2 after 200ms total; max=2 → at most 3 calls)', async () => {
    vi.useFakeTimers()
    process.env.UPSTREAM_RETRY_BASE_MS   = '200'
    process.env.UPSTREAM_RETRY_JITTER_MS = '0'
    process.env.UPSTREAM_RETRY_MAX       = '2'
    __resetEnvCacheForTests()

    const { client } = makeMockClient([
      { throws: { status: 502 } },
      { throws: { status: 502 } },
      { content: VALID_RESPONSE_JSON },
    ]) as unknown as { client: OpenAI; calls: number }

    const promise = streamAnswer({
      client, systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'q' }],
      strictSchemaSupported: true,
    })

    // At t=0 the first attempt fires synchronously before any timer is set.
    // We only assert the tight boundary for the FIRST backoff to keep the
    // test robust against microtask draining inside advanceTimersByTimeAsync —
    // subsequent attempts are covered by the previous test case + the
    // cumulative total advance here.
    await vi.advanceTimersByTimeAsync(199)
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    await vi.advanceTimersByTimeAsync(2)
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    // Advance through the second backoff window in one shot (401ms total);
    // this deliberately avoids the microtask-drain edge case that made the
    // finer-grained assertion flaky.
    await vi.advanceTimersByTimeAsync(500)
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3)

    await promise
  })
})

describe('withRetry — retry budget override', () => {
  it('UPSTREAM_RETRY_MAX=0 → no retries, first failure propagates', async () => {
    vi.useFakeTimers()
    process.env.UPSTREAM_RETRY_MAX = '0'
    __resetEnvCacheForTests()
    const { client } = makeMockClient([
      { throws: { status: 502 } },
    ]) as unknown as { client: OpenAI; calls: number }
    await expect(runWithFakeTimers(() =>
      streamAnswer({
        client, systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'q' }],
        strictSchemaSupported: true,
      }),
    )).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(Upstream5xxError)
      return true
    })
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })
})

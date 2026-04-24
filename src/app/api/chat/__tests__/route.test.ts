import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Module-level mocks ------------------------------------------------------
//
// `streamAnswer` is mocked at module level so the route's `await streamAnswer(...)`
// call resolves (or rejects) with a value we control. We also mock the logger
// factory so we can capture every log entry via a PassThrough, which is the
// same pattern established in src/obs/__tests__/logger.test.ts — hermetic and
// deterministic across dev/prod (no pino-pretty worker thread in the way).
//
// IMPORTANT: vi.mock calls are hoisted above all imports, so the mock factory
// must not capture outer-scope references. We expose the mock-capturing shared
// state via getters on the mock itself, invoked from tests AFTER import.

// Hoisted state — vi.hoisted() runs BEFORE vi.mock factories so any variables
// declared here can safely be referenced from inside the mock factories. We
// build the pino capturing logger + the shared mutable `capturedLines` array
// inside this block.
const mocks = vi.hoisted(() => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { PassThrough: PT } = require('node:stream') as typeof import('node:stream')
  // pino's runtime shape is a callable module; use a permissive type here
  // because its TS typing (namespace + callable) doesn't model well under
  // require(). The capturing logger only needs .child/.info/.warn/.error.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinoFactory = require('pino') as any
  const lines: string[] = []
  const stream = new PT()
  stream.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    for (const line of text.split('\n')) {
      if (line.length > 0) lines.push(line)
    }
  })
  const factory = typeof pinoFactory === 'function' ? pinoFactory : pinoFactory.default
  const logger = factory({ level: 'debug' }, stream)
  const streamAnswerMock = vi.fn()
  // Plan 05.1-04: override slot for getRequestUser return value. When null,
  // the mocked module delegates to the real implementation (so the existing
  // `process.env.NODE_ENV=production + no session cookie → {error:'unauthorized'}`
  // test keeps exercising the real code path). When set, the discriminant
  // tests inject {error:'session_expired'} / {error:'forbidden', upn} without
  // having to synth iron-session cookies — session-state synthesis is covered
  // by src/app/api/__tests__/_middleware.test.ts (Plan 05.1-04 Task 1).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authOverride: { value: any } = { value: null }
  // Plan 06-02: trackEvent spy. Captures all (name, dims, meas) call arguments
  // for event-ordering and PII-absence assertions.
  const trackEventSpy = vi.fn()
  return {
    capturedLines: lines as string[],
    logger,
    streamAnswerMock,
    authOverride,
    trackEventSpy,
  }
})

vi.mock('@/llm/stream', () => ({
  streamAnswer: mocks.streamAnswerMock,
}))

vi.mock('@/llm/client', () => ({
  // createLlmClient() returns "anything non-null" — route never touches the
  // client directly (it's passed straight through to streamAnswer), so a
  // placeholder object is sufficient.
  createLlmClient: () => ({}),
}))

vi.mock('@/obs/logger', () => ({
  logger: mocks.logger,
  requestLogger: (fields: Record<string, unknown>) => mocks.logger.child(fields),
}))

// Plan 06-02: mock telemetry so trackEvent() calls are captured by the spy
// without requiring a live OTel exporter. The mock also prevents the pino
// dual-emit inside trackEvent() from adding lines to capturedLines (the
// existing tests that check capturedLines already account for what the REAL
// logger emits via the requestLogger mock above).
vi.mock('@/obs/telemetry', () => ({
  trackEvent: mocks.trackEventSpy,
}))

// Plan 05.1-04: fully replace the _middleware module with a hermetic mock.
// The real _middleware now reads the iron-session cookie via `cookies()` from
// `next/headers`, which is not available outside an actual route-handler
// request context (vitest-node). Rather than pull in next/headers mocking
// here, we re-implement the SAME THREE BRANCHES the real middleware exposes
// — discriminant-injection, prod-no-cookie-unauthorized, and
// dev-no-cookie-local-dev-stub — and trust the real middleware's behaviour
// to be covered by src/app/api/__tests__/_middleware.test.ts (Plan 05.1-04
// Task 1's 7 tests).
vi.mock('@/app/api/_middleware', () => ({
  getRequestUser: async (_req: Request) => {
    // Injected discriminant wins (the discriminant describe block uses this).
    if (mocks.authOverride.value !== null) return mocks.authOverride.value
    // Prod-no-cookie path: returns unauthorized. Mirrors real middleware so
    // the Issue #3 semaphore-release test ('401 in prod releases the slot')
    // keeps exercising a real 401.
    if (process.env.NODE_ENV === 'production') {
      return { error: 'unauthorized' }
    }
    // Dev/test-permissive stub: matches real middleware's Phase 2/3/4
    // regression guard — no session cookie + non-prod → local-dev user with
    // required role. Shape matches the new AuthResult success branch
    // (sub/email/roles).
    return {
      sub: 'local-dev',
      email: 'local@dev',
      roles: ['KbAssistant.User'],
    }
  },
}))

// --- Imports AFTER mocks (hoisting-safe) -------------------------------------
import { POST } from '@/app/api/chat/route'
import {
  RefusalError,
  SchemaRejectAfterRetryError,
  Upstream5xxError,
  UpstreamAuthError,
  UpstreamTimeoutError,
} from '@/llm/errors'
import { chatSemaphore, __resetForTests as resetSemaphore } from '@/chat/concurrency'
import { __resetEnvCacheForTests } from '@/config/env'
import { FALLBACK_STRING } from '@/grounding/fallback'

// --- Helpers -----------------------------------------------------------------

const mockStreamAnswer = mocks.streamAnswerMock
const capturedLines = mocks.capturedLines
// Plan 06-02: trackEvent spy for event-ordering and PII-absence assertions.
const trackEventSpy = mocks.trackEventSpy

type SseFrame =
  | { type: 'answer_delta'; text: string }
  | { type: 'citations'; citations: unknown[] }
  | { type: 'fallback'; reason: string; text: string }
  | { type: 'done'; can_answer: boolean; validator_flips: number }
  | { type: 'error'; code: string; message: string }
  // Phase 6 Plan 03 — server echoes message_id before answer_delta.
  | { type: 'message_id'; id: string }

async function readAllSseFrames(res: Response): Promise<SseFrame[]> {
  const body = res.body
  if (!body) return []
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const frames: SseFrame[] = []
  // Read until the stream closes.
  // Each frame is `data: <json>\n\n` per 02-CONTEXT.md §1.
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: !done })
    if (done) {
      buf += decoder.decode()
      break
    }
  }
  for (const block of buf.split('\n\n')) {
    const m = block.match(/^data: (.*)$/s)
    if (m) {
      frames.push(JSON.parse(m[1]) as SseFrame)
    }
  }
  return frames
}

function makePost(body: unknown, init?: { signal?: AbortSignal }): Request {
  return new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: init?.signal,
  })
}

function validMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
  return [{ role: 'user', content: 'How do I flag an article?' }]
}

function validBody() {
  return { role: 'consumer' as const, messages: validMessages() }
}

function clearCapturedLogs(): void {
  capturedLines.length = 0
}

// --- Test setup/teardown -----------------------------------------------------

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  process.env.LLM_AUTH_MODE = 'bearer'
  process.env.LLM_BASE_URL = 'https://api.openai.com/v1'
  process.env.LLM_API_KEY = 'sk-test'
  process.env.LLM_MODEL = 'gpt-4o'
  process.env.MAX_INFLIGHT_STREAMS = '20'
  process.env.MAX_MESSAGES = '20'
  process.env.MAX_MESSAGE_CHARS = '8000'
  __resetEnvCacheForTests()
  resetSemaphore(20)
  clearCapturedLogs()
  mockStreamAnswer.mockReset()
  // Plan 06-02: reset trackEvent spy each test.
  trackEventSpy.mockReset()
  // Plan 05-03: reset the auth override each test so accidental leakage
  // between tests doesn't turn a happy-path run into a 401.
  mocks.authOverride.value = null
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  __resetEnvCacheForTests()
})

// =============================================================================
// HAPPY PATH (Phase 2 SC #1)
// =============================================================================

describe('POST /api/chat — happy path (Phase 2 SC #1)', () => {
  it('emits answer_delta → citations → done in that exact order with X-Request-Id header', async () => {
    mockStreamAnswer.mockResolvedValue({
      response: {
        can_answer: true,
        answer: 'You can flag an article by raising a correction request.',
        citations: [
          {
            source_id: 'KB0022991',
            section_id: 'approvers',
            // "Colleague Technology" is a verbatim substring of the approvers
            // section body AND is in ENTITY_ALLOWLIST.names (it's harvested
            // there by entities.ts). Safe quote for happy-path assertions.
            quote: 'Colleague Technology',
          },
        ],
      },
      usage: { prompt_tokens: 150, completion_tokens: 42 },
    })

    const req = makePost(validBody())
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect((res.headers.get('content-type') ?? '').toLowerCase()).toContain('text/event-stream')
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(res.headers.get('connection')).toBe('keep-alive')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    const rid = res.headers.get('x-request-id')
    expect(rid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

    const frames = await readAllSseFrames(res)
    // Phase 6 Plan 03: message_id frame is emitted FIRST before answer_delta.
    // Frame order: message_id → answer_delta → citations → done (4 frames total).
    expect(frames.map(f => f.type)).toEqual(['message_id', 'answer_delta', 'citations', 'done'])
    // message_id is a valid UUID
    expect((frames[0] as { id: string }).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect((frames[1] as { text: string }).text).toBe(
      'You can flag an article by raising a correction request.',
    )
    expect((frames[3] as { validator_flips: number }).validator_flips).toBe(0)
    expect((frames[3] as { can_answer: boolean }).can_answer).toBe(true)
  })
})

// =============================================================================
// FALLBACK PATHS (Phase 2 SC #2) — each MUST emit zero answer_delta (Issue #4)
// =============================================================================

describe('POST /api/chat — fallback paths (Phase 2 SC #2): zero answer_delta', () => {
  it('can_answer_false: only one fallback frame, no answer_delta/citations/done', async () => {
    mockStreamAnswer.mockResolvedValue({
      response: {
        can_answer: false,
        answer: 'I cannot answer that based on the loaded KBs.',
        citations: [],
      },
      usage: { prompt_tokens: 50, completion_tokens: 10 },
    })

    const res = await POST(makePost(validBody()))
    const frames = await readAllSseFrames(res)

    // ZERO answer_delta (Pitfall 5 — server refuses to re-narrate refusal).
    expect(frames.filter(f => f.type === 'answer_delta')).toHaveLength(0)
    // EXACTLY ONE fallback, EXACTLY ZERO citations/done.
    const fallbacks = frames.filter(f => f.type === 'fallback')
    expect(fallbacks).toHaveLength(1)
    expect((fallbacks[0] as { reason: string }).reason).toBe('can_answer_false')
    expect((fallbacks[0] as { text: string }).text).toBe(FALLBACK_STRING)
    expect(frames.filter(f => f.type === 'citations')).toHaveLength(0)
    expect(frames.filter(f => f.type === 'done')).toHaveLength(0)
  })

  it('all_citations_stripped: validator strips fake-quote citation → one fallback, zero answer_delta', async () => {
    mockStreamAnswer.mockResolvedValue({
      response: {
        can_answer: true,
        answer: 'An answer that looked OK.',
        citations: [
          {
            source_id: 'KB0020882',
            section_id: 'who-can-submit',
            // Bogus quote — not a verbatim substring of the section body.
            quote: 'This is not a quote that exists in the source body at all.',
          },
        ],
      },
      usage: { prompt_tokens: 80, completion_tokens: 30 },
    })

    const res = await POST(makePost(validBody()))
    const frames = await readAllSseFrames(res)

    expect(frames.filter(f => f.type === 'answer_delta')).toHaveLength(0)
    const fallbacks = frames.filter(f => f.type === 'fallback')
    expect(fallbacks).toHaveLength(1)
    expect((fallbacks[0] as { reason: string }).reason).toBe('all_citations_stripped')
    expect(frames.filter(f => f.type === 'citations')).toHaveLength(0)
    expect(frames.filter(f => f.type === 'done')).toHaveLength(0)
  })

  it('allowlist_violation (Phase 2 SC #3): "Jane Doe" in answer → fallback allowlist_violation, zero answer_delta', async () => {
    mockStreamAnswer.mockResolvedValue({
      response: {
        can_answer: true,
        // "Jane Doe" is a two-token Capitalised name not in ENTITY_ALLOWLIST.names.
        // The preceding wording uses real vocabulary from the KBs so it won't
        // trigger any other violation before names.
        answer: 'Jane Doe approves this.',
        citations: [
          {
            source_id: 'KB0022991',
            section_id: 'approvers',
            quote: 'Colleague Technology',
          },
        ],
      },
      usage: { prompt_tokens: 100, completion_tokens: 25 },
    })

    const res = await POST(makePost(validBody()))
    const frames = await readAllSseFrames(res)

    expect(frames.filter(f => f.type === 'answer_delta')).toHaveLength(0)
    const fallbacks = frames.filter(f => f.type === 'fallback')
    expect(fallbacks).toHaveLength(1)
    expect((fallbacks[0] as { reason: string }).reason).toBe('allowlist_violation')
    expect((fallbacks[0] as { text: string }).text).toBe(FALLBACK_STRING)

    // Structured log carries {class, token_count}; violating token NOT logged.
    // Plan 06-02: trackEvent() dual-emits to pino AFTER the terminal log.info,
    // so find the terminal log entry by its msg field rather than by position.
    const parsedLines = capturedLines.map(line => JSON.parse(line) as Record<string, unknown>)
    const terminalLog = parsedLines.find(entry => entry.msg === 'chat request completed')
    expect(terminalLog).toBeTruthy()
    expect(terminalLog?.fallback_reason).toBe('allowlist_violation')
    expect(terminalLog?.allowlist_violation).toEqual({ class: 'names', token_count: 1 })

    // Forbidden: violating token MUST NOT appear anywhere in log output.
    const wholeLog = capturedLines.join('\n')
    expect(wholeLog).not.toContain('Jane Doe')
  })

  it('refusal: streamAnswer throws RefusalError → one fallback refusal, zero answer_delta', async () => {
    mockStreamAnswer.mockRejectedValue(new RefusalError('policy refusal text'))

    const res = await POST(makePost(validBody()))
    const frames = await readAllSseFrames(res)

    expect(frames.filter(f => f.type === 'answer_delta')).toHaveLength(0)
    const fallbacks = frames.filter(f => f.type === 'fallback')
    expect(fallbacks).toHaveLength(1)
    expect((fallbacks[0] as { reason: string }).reason).toBe('refusal')
    expect((fallbacks[0] as { text: string }).text).toBe(FALLBACK_STRING)
  })
})

// =============================================================================
// ERROR PATHS (infra failures — zero answer_delta)
// =============================================================================

describe('POST /api/chat — error paths (infra failures)', () => {
  it('UpstreamTimeoutError → error{code:"upstream_timeout"}, zero answer_delta', async () => {
    mockStreamAnswer.mockRejectedValue(new UpstreamTimeoutError())
    const res = await POST(makePost(validBody()))
    const frames = await readAllSseFrames(res)
    expect(frames.filter(f => f.type === 'answer_delta')).toHaveLength(0)
    const errors = frames.filter(f => f.type === 'error')
    expect(errors).toHaveLength(1)
    expect((errors[0] as { code: string }).code).toBe('upstream_timeout')
  })

  it('Upstream5xxError(502) → error{code:"upstream_5xx"}; log ingress_status_code=502', async () => {
    mockStreamAnswer.mockRejectedValue(new Upstream5xxError(502, 'bad gateway'))
    const res = await POST(makePost(validBody()))
    const frames = await readAllSseFrames(res)
    expect(frames.filter(f => f.type === 'answer_delta')).toHaveLength(0)
    const errors = frames.filter(f => f.type === 'error')
    expect(errors).toHaveLength(1)
    expect((errors[0] as { code: string }).code).toBe('upstream_5xx')
    expect((errors[0] as { message: string }).message).toBe('upstream 502')

    // Plan 06-02: find terminal log by msg (trackEvent pino lines follow it).
    const parsedLines = capturedLines.map(line => JSON.parse(line) as Record<string, unknown>)
    const termLog = parsedLines.find(entry => entry.msg === 'chat request completed')
    expect(termLog?.ingress_status_code).toBe(502)
  })

  it('SchemaRejectAfterRetryError → error{code:"schema_reject_after_retry"}', async () => {
    mockStreamAnswer.mockRejectedValue(new SchemaRejectAfterRetryError(new Error('ajv exploded')))
    const res = await POST(makePost(validBody()))
    const frames = await readAllSseFrames(res)
    expect(frames.filter(f => f.type === 'answer_delta')).toHaveLength(0)
    const errors = frames.filter(f => f.type === 'error')
    expect(errors).toHaveLength(1)
    expect((errors[0] as { code: string }).code).toBe('schema_reject_after_retry')
  })

  it('UpstreamAuthError(401) → error{code:"internal"}; ingress_status_code=401 in log (Pitfall 11)', async () => {
    mockStreamAnswer.mockRejectedValue(new UpstreamAuthError(401))
    const res = await POST(makePost(validBody()))
    const frames = await readAllSseFrames(res)
    expect(frames.filter(f => f.type === 'answer_delta')).toHaveLength(0)
    const errors = frames.filter(f => f.type === 'error')
    expect(errors).toHaveLength(1)
    expect((errors[0] as { code: string }).code).toBe('internal')
    // Plan 06-02: find terminal log by msg (trackEvent pino lines follow it).
    const parsedLines = capturedLines.map(line => JSON.parse(line) as Record<string, unknown>)
    const termLog = parsedLines.find(entry => entry.msg === 'chat request completed')
    expect(termLog?.ingress_status_code).toBe(401)
  })

  it('unknown Error → error{code:"internal"}', async () => {
    mockStreamAnswer.mockRejectedValue(new Error('something unexpected'))
    const res = await POST(makePost(validBody()))
    const frames = await readAllSseFrames(res)
    expect(frames.filter(f => f.type === 'answer_delta')).toHaveLength(0)
    const errors = frames.filter(f => f.type === 'error')
    expect(errors).toHaveLength(1)
    expect((errors[0] as { code: string }).code).toBe('internal')
  })
})

// =============================================================================
// PRE-STREAM ERRORS (HTTP 400/413/401, NOT SSE)
// =============================================================================

describe('POST /api/chat — pre-stream validation errors', () => {
  it('malformed JSON body → 400 {error:"messages_missing"}', async () => {
    const req = new Request('https://example.test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'this is not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((res.headers.get('content-type') ?? '').toLowerCase()).not.toContain('text/event-stream')
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('messages_missing')
  })

  it('{role:"admin"} → 400 role_invalid', async () => {
    const res = await POST(makePost({ role: 'admin', messages: validMessages() }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('role_invalid')
  })

  it('{role:"consumer"} (no messages) → 400 messages_missing', async () => {
    const res = await POST(makePost({ role: 'consumer' }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('messages_missing')
  })

  it('{role:"consumer", messages:[]} → 400 messages_empty', async () => {
    const res = await POST(makePost({ role: 'consumer', messages: [] }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('messages_empty')
  })

  it('21 messages (over MAX_MESSAGES) → 413 history_cap_exceeded', async () => {
    const messages = Array(21).fill({ role: 'user', content: 'x' })
    const res = await POST(makePost({ role: 'consumer', messages }))
    expect(res.status).toBe(413)
    expect(((await res.json()) as { error: string }).error).toBe('history_cap_exceeded')
  })

  it('message content > MAX_MESSAGE_CHARS → 413 message_too_long', async () => {
    const content = 'x'.repeat(9000)
    const res = await POST(makePost({ role: 'consumer', messages: [{ role: 'user', content }] }))
    expect(res.status).toBe(413)
    expect(((await res.json()) as { error: string }).error).toBe('message_too_long')
  })

  it('pre-stream errors carry X-Request-Id header for correlation', async () => {
    const res = await POST(makePost({ role: 'admin', messages: validMessages() }))
    expect(res.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })
})

// =============================================================================
// CONCURRENCY + SEMAPHORE (Issue #3 — release on every exit path)
// =============================================================================

describe('POST /api/chat — concurrency cap (429) + semaphore-release regression', () => {
  it('semaphore full → 429 with Retry-After:5, NO SSE stream opened', async () => {
    resetSemaphore(1)
    // Drain the single permit.
    expect(chatSemaphore.tryAcquire()).toBe(true)

    const res = await POST(makePost(validBody()))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('5')
    expect((res.headers.get('content-type') ?? '').toLowerCase()).not.toContain('text/event-stream')
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('rate_limited')
  })

  it('Issue #3: 400 (malformed body) releases the slot immediately', async () => {
    resetSemaphore(1)
    const req = new Request('https://example.test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    // Right after the 400 resolves, the slot must be free again.
    expect(chatSemaphore.tryAcquire()).toBe(true)
  })

  it('Issue #3: 413 (history cap) releases the slot immediately', async () => {
    resetSemaphore(1)
    const messages = Array(21).fill({ role: 'user', content: 'x' })
    const res = await POST(makePost({ role: 'consumer', messages }))
    expect(res.status).toBe(413)
    expect(chatSemaphore.tryAcquire()).toBe(true)
  })

  it('Issue #3: 401 (unauthorized in prod) releases the slot immediately', async () => {
    resetSemaphore(1)
    vi.stubEnv('NODE_ENV', 'production')
    // Production + no Authorization header → 401.
    const res = await POST(makePost(validBody()))
    expect(res.status).toBe(401)
    expect(chatSemaphore.tryAcquire()).toBe(true)
    vi.unstubAllEnvs()
  })

  it('streaming-path: happy-path request releases the slot once the stream closes', async () => {
    resetSemaphore(1)
    mockStreamAnswer.mockResolvedValue({
      response: {
        can_answer: true,
        answer: 'short answer',
        citations: [
          { source_id: 'KB0022991', section_id: 'approvers', quote: 'Colleague Technology' },
        ],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })
    const res = await POST(makePost(validBody()))
    expect(res.status).toBe(200)
    // Drain the stream completely — this is when the IIFE finally runs.
    await readAllSseFrames(res)
    expect(chatSemaphore.tryAcquire()).toBe(true)
  })
})

// =============================================================================
// STRUCTURED LOG FIELD PRESENCE + USAGE (Phase 2 SC #5; Issue #7)
// =============================================================================

describe('POST /api/chat — structured log (Phase 2 SC #5)', () => {
  it('happy path log has prompt_tokens=123 + completion_tokens=45 (Issue #7 concrete numbers from usage)', async () => {
    mockStreamAnswer.mockResolvedValue({
      response: {
        can_answer: true,
        answer: 'Yes, you can.',
        citations: [
          { source_id: 'KB0022991', section_id: 'approvers', quote: 'Colleague Technology' },
        ],
      },
      usage: { prompt_tokens: 123, completion_tokens: 45 },
    })
    const res = await POST(makePost(validBody()))
    await readAllSseFrames(res)

    // Plan 06-02: trackEvent pino dual-emits follow log.info, so find by msg.
    const parsedLines = capturedLines.map(l => JSON.parse(l) as Record<string, unknown>)
    const last = parsedLines.find(entry => entry.msg === 'chat request completed')
    expect(last).toBeTruthy()
    expect(last?.prompt_tokens).toBe(123)
    expect(last?.completion_tokens).toBe(45)
    expect(last?.request_id).toBeTruthy()
    expect(last?.role).toBe('consumer')
    expect(last?.host).toBe('web')
    expect(last?.validator_flips).toBe(0)
    expect(last?.refusal_fired).toBe(false)
    expect(last?.fallback_reason).toBeNull()
    expect(last?.ingress_status_code).toBe(200)
    expect(typeof last?.latency_ms).toBe('number')
  })

  it('error path log has prompt_tokens=null + completion_tokens=null when streamAnswer throws before usage', async () => {
    mockStreamAnswer.mockRejectedValue(new Upstream5xxError(503))
    const res = await POST(makePost(validBody()))
    await readAllSseFrames(res)
    const parsedLines = capturedLines.map(l => JSON.parse(l) as Record<string, unknown>)
    const last = parsedLines.find(entry => entry.msg === 'chat request completed')
    expect(last?.prompt_tokens).toBeNull()
    expect(last?.completion_tokens).toBeNull()
    expect(last?.ingress_status_code).toBe(503)
  })

  it('forbidden strings never appear in any captured log (string-grep over concatenated output)', async () => {
    // Drive a happy-path + a fallback + an error to cover multiple log sites.
    mockStreamAnswer.mockResolvedValueOnce({
      response: {
        can_answer: true,
        answer: 'happy answer',
        citations: [
          { source_id: 'KB0022991', section_id: 'approvers', quote: 'Colleague Technology' },
        ],
      },
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    mockStreamAnswer.mockResolvedValueOnce({
      response: {
        can_answer: true,
        answer: 'Jane Doe approves this.',
        citations: [
          { source_id: 'KB0022991', section_id: 'approvers', quote: 'Colleague Technology' },
        ],
      },
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    mockStreamAnswer.mockRejectedValueOnce(new Upstream5xxError(502))

    await readAllSseFrames(await POST(makePost(validBody())))
    await readAllSseFrames(await POST(makePost(validBody())))
    await readAllSseFrames(await POST(makePost(validBody())))

    const whole = capturedLines.join('\n')

    // Field-name forbidden list — these are RAW CONTENT field names that MUST
    // never appear as JSON keys in any log or telemetry dual-emit line.
    // Note: 'answer' is intentionally absent here because Plan 06-02 adds
    // `total_answer_ms` as a measurement key — a safe non-PII field name
    // whose substring 'answer' is part of the key, not raw answer content.
    // The intent is to block raw content fields; the scrubber guards against
    // raw answer text appearing as a VALUE.
    for (const needle of ['user_question', 'messages', '"content"', '"quote"']) {
      expect(whole.includes(needle), `log unexpectedly contains forbidden string "${needle}"`).toBe(false)
    }
    // Violating allowlist token must NEVER leak.
    expect(whole).not.toContain('Jane Doe')
    // happy_answer and raw_answer must never appear as values in logs.
    expect(whole).not.toContain('happy answer')
    expect(whole).not.toContain('Jane Doe approves this.')
    // But allowed fields MUST be present so we know the tests exercised the real path.
    expect(whole).toContain('request_id')
    expect(whole).toContain('validator_flips')
    expect(whole).toContain('fallback_reason')
    expect(whole).toContain('ingress_status_code')
    expect(whole).toContain('prompt_tokens')
    expect(whole).toContain('completion_tokens')
    expect(whole).toContain('latency_ms')
  })
})

// =============================================================================
// CLIENT DISCONNECT
// =============================================================================

describe('POST /api/chat — client disconnect', () => {
  it('request.signal aborts → no unhandled rejection + semaphore released', async () => {
    resetSemaphore(1)
    // streamAnswer resolves normally — the route's abort listener fires when
    // the client signal aborts. We care that (a) no unhandled rejection
    // crashes the test, (b) the semaphore is released.
    mockStreamAnswer.mockResolvedValue({
      response: {
        can_answer: true,
        answer: 'ok',
        citations: [
          { source_id: 'KB0022991', section_id: 'approvers', quote: 'Colleague Technology' },
        ],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const ac = new AbortController()
    const req = makePost(validBody(), { signal: ac.signal })
    const res = await POST(req)
    expect(res.status).toBe(200)

    // Simulate the client disconnecting mid-stream.
    ac.abort()

    // Drain whatever was produced. A cancelled reader may throw AbortError —
    // swallow it to verify the route itself did not cause an unhandled
    // rejection.
    try {
      await readAllSseFrames(res)
    } catch {
      /* client-side AbortError; route behaviour is what we care about */
    }

    // The IIFE finally must have released the slot after the abort.
    // Give the microtask queue a tick to drain.
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(chatSemaphore.tryAcquire()).toBe(true)
  })
})

// =============================================================================
// PLAN 05.1-04: AUTH DISCRIMINANTS (session_expired / forbidden / unauthorized)
// =============================================================================
//
// These tests inject the three _middleware AuthResult error variants via the
// authOverride hook defined in the vi.mock factory above. Session-state
// synthesis is covered in src/app/api/__tests__/_middleware.test.ts (Plan
// 05.1-04 Task 1). Here we only verify the ROUTE'S translation of each
// internal variant → STABLE wire HTTP status + JSON body + structured log
// line.
//
// Wire-code preservation contract:
//   session_expired (internal) → 401 { error: 'token_expired' } (wire)
//   forbidden       (internal) → 403 { error: 'access_denied' } (wire)
//   unauthorized    (internal) → 401 { error: 'unauthorized' }  (wire)

describe('POST /api/chat — Plan 05.1-04 auth discriminants', () => {
  it('session_expired → 401 {error:"token_expired"} + X-Request-Id + log.warn with auth_result', async () => {
    mocks.authOverride.value = { error: 'session_expired' }

    const res = await POST(makePost(validBody()))

    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json')
    expect(res.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    // WIRE CODE PRESERVED: internal `session_expired` → wire `token_expired`
    // so ErrorCard + useChatStream + 30+ frontend assertions don't change.
    expect(((await res.json()) as { error: string }).error).toBe('token_expired')

    // log.warn fired once; no terminal log.info (single-log-per-completed-
    // request invariant: failed-auth paths land on warn, only successful
    // streams emit the terminal info). Find the auth-fail log line.
    const authLog = capturedLines
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .find(entry => entry.msg === 'chat auth failed')
    expect(authLog).toBeTruthy()
    // Internal discriminant surfaces in log for operator observability.
    expect(authLog?.auth_result).toBe('session_expired')
    expect(authLog?.ingress_status_code).toBe(401)
    expect(authLog?.level).toBe(40) // pino warn level
  })

  it('forbidden → 403 {error:"access_denied"} + X-Request-Id + log.warn with auth_result', async () => {
    // The `forbidden` variant carries a `upn` field (the user's email) per
    // the new AuthResult shape. The route does not surface upn on the wire
    // — only the access_denied wire code — but accepts it in the union.
    mocks.authOverride.value = { error: 'forbidden', upn: 'carol@mmc.com' }

    const res = await POST(makePost(validBody()))

    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json')
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(((await res.json()) as { error: string }).error).toBe('access_denied')

    const authLog = capturedLines
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .find(entry => entry.msg === 'chat auth failed')
    expect(authLog?.auth_result).toBe('forbidden')
    expect(authLog?.ingress_status_code).toBe(403)
  })

  it('unauthorized → 401 {error:"unauthorized"} + X-Request-Id + log.warn with auth_result', async () => {
    mocks.authOverride.value = { error: 'unauthorized' }

    const res = await POST(makePost(validBody()))

    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: string }).error).toBe('unauthorized')

    const authLog = capturedLines
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .find(entry => entry.msg === 'chat auth failed')
    expect(authLog?.auth_result).toBe('unauthorized')
    expect(authLog?.ingress_status_code).toBe(401)
  })

  it('successful auth: terminal log.info includes auth_result:"success" + sub=oid', async () => {
    // New AuthResult success shape: { sub, email, roles }. The route logs
    // `sub` only — email + roles are deliberately NOT surfaced on the wire
    // or in logs to minimise PII footprint.
    mocks.authOverride.value = {
      sub: 'entra-oid-abc-123',
      email: 'alice@mmc.com',
      roles: ['KbAssistant.User'],
    }
    mockStreamAnswer.mockResolvedValue({
      response: {
        can_answer: true,
        answer: 'brief',
        citations: [
          { source_id: 'KB0022991', section_id: 'approvers', quote: 'Colleague Technology' },
        ],
      },
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })

    const res = await POST(makePost(validBody()))
    expect(res.status).toBe(200)
    await readAllSseFrames(res)

    // Plan 06-02: trackEvent pino dual-emits follow log.info, so find by msg.
    const parsedLines = capturedLines.map(l => JSON.parse(l) as Record<string, unknown>)
    const last = parsedLines.find(entry => entry.msg === 'chat request completed')
    expect(last).toBeTruthy()
    expect(last?.auth_result).toBe('success')
    expect(last?.sub).toBe('entra-oid-abc-123')
    // email + roles deliberately NOT logged to minimise PII footprint.
    // `sub` alone is enough for operator correlation back to the Entra
    // directory.
    expect(last?.email).toBeUndefined()
    expect(last?.roles).toBeUndefined()
  })
})

// =============================================================================
// PLAN 06-02: TELEMETRY EVENT STREAM
//
// These tests verify the server-side event stream emitted by /api/chat via the
// trackEvent() spy. The spy captures (name, dimensions, measurements) triples
// without requiring a live OTel exporter or App Insights connection string.
// =============================================================================

/** Helper: extract all trackEvent call argument tuples from the spy. */
function getEventCalls(): Array<[string, Record<string, unknown>, Record<string, number>]> {
  return trackEventSpy.mock.calls as Array<[string, Record<string, unknown>, Record<string, number>]>
}

function happyStreamResult() {
  return {
    response: {
      can_answer: true,
      answer: 'You can flag an article by raising a correction request.',
      citations: [
        {
          source_id: 'KB0022991',
          section_id: 'approvers',
          quote: 'Colleague Technology',
        },
      ],
    },
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  }
}

describe('POST /api/chat — Plan 06-02 telemetry event stream', () => {
  it('happy path emits chat_request_started → question_hash → citation_returned → chat_request_completed in order', async () => {
    mockStreamAnswer.mockResolvedValue(happyStreamResult())

    const res = await POST(makePost(validBody()))
    await readAllSseFrames(res)

    const calls = getEventCalls()
    const names = calls.map(c => c[0])

    // Required events must be present
    expect(names).toContain('chat_request_started')
    expect(names).toContain('question_hash')
    expect(names).toContain('citation_returned')
    expect(names).toContain('chat_request_completed')

    // Ordering: started < question_hash < citation_returned < completed
    const idxStarted = names.indexOf('chat_request_started')
    const idxQH = names.indexOf('question_hash')
    const idxCit = names.indexOf('citation_returned')
    const idxCompleted = names.lastIndexOf('chat_request_completed')
    expect(idxStarted).toBeLessThan(idxQH)
    expect(idxQH).toBeLessThan(idxCit)
    expect(idxCit).toBeLessThan(idxCompleted)
  })

  it('question_hash event carries a valid 16-hex-char hash and never the raw message text', async () => {
    mockStreamAnswer.mockResolvedValue(happyStreamResult())

    const rawQuestion = 'How do I flag an article?'
    const body = { role: 'consumer' as const, messages: [{ role: 'user', content: rawQuestion }] }
    const res = await POST(makePost(body))
    await readAllSseFrames(res)

    const calls = getEventCalls()
    const qhCall = calls.find(c => c[0] === 'question_hash')
    expect(qhCall).toBeTruthy()
    const dims = qhCall![1]
    expect(dims['question_hash']).toMatch(/^[0-9a-f]{16}$/)
    // PII: raw question text must not appear in the dimension map
    const serialised = JSON.stringify(dims)
    expect(serialised).not.toContain(rawQuestion)
    expect(serialised).not.toContain('flag an article')
  })

  it('first-turn request emits session_start and role_selected', async () => {
    mockStreamAnswer.mockResolvedValue(happyStreamResult())

    // Single user message = first turn
    const res = await POST(makePost({ role: 'consumer', messages: [{ role: 'user', content: 'Hello' }] }))
    await readAllSseFrames(res)

    const names = getEventCalls().map(c => c[0])
    expect(names).toContain('session_start')
    expect(names).toContain('role_selected')
  })

  it('second-turn request does NOT emit session_start or role_selected', async () => {
    mockStreamAnswer.mockResolvedValue(happyStreamResult())

    // Two user messages = second turn (multi-turn conversation)
    const messages = [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Second question' },
    ]
    const res = await POST(makePost({ role: 'consumer', messages }))
    await readAllSseFrames(res)

    const names = getEventCalls().map(c => c[0])
    expect(names).not.toContain('session_start')
    expect(names).not.toContain('role_selected')
  })

  it('chip_vs_freeform emits "chip" when chip_id is in request body', async () => {
    mockStreamAnswer.mockResolvedValue(happyStreamResult())

    const bodyWithChip = {
      role: 'consumer' as const,
      messages: validMessages(),
      chip_id: 'chip-123-abc',
    }
    const res = await POST(makePost(bodyWithChip))
    await readAllSseFrames(res)

    const calls = getEventCalls()
    const chipCall = calls.find(c => c[0] === 'chip_vs_freeform')
    expect(chipCall).toBeTruthy()
    expect(chipCall![1]['chip_or_freeform']).toBe('chip')
    expect(chipCall![1]['chip_id']).toBe('chip-123-abc')
  })

  it('chip_vs_freeform emits "freeform" when no chip_id in request body', async () => {
    mockStreamAnswer.mockResolvedValue(happyStreamResult())

    const res = await POST(makePost(validBody()))
    await readAllSseFrames(res)

    const calls = getEventCalls()
    const chipCall = calls.find(c => c[0] === 'chip_vs_freeform')
    expect(chipCall).toBeTruthy()
    expect(chipCall![1]['chip_or_freeform']).toBe('freeform')
  })

  it('fallback_trigger with reason="all_citations_stripped" is emitted when validator strips all', async () => {
    mockStreamAnswer.mockResolvedValue({
      response: {
        can_answer: true,
        answer: 'An answer that looked OK.',
        citations: [
          {
            source_id: 'KB0020882',
            section_id: 'who-can-submit',
            quote: 'This is not a verbatim substring of the section body.',
          },
        ],
      },
      usage: { prompt_tokens: 80, completion_tokens: 30 },
    })

    const res = await POST(makePost(validBody()))
    await readAllSseFrames(res)

    const calls = getEventCalls()
    const fallbackCall = calls.find(c => c[0] === 'fallback_trigger')
    expect(fallbackCall).toBeTruthy()
    expect(fallbackCall![1]['reason']).toBe('all_citations_stripped')
  })

  it('ingress_error is emitted when streamAnswer throws UpstreamAuthError', async () => {
    mockStreamAnswer.mockRejectedValue(new UpstreamAuthError(401))

    const res = await POST(makePost(validBody()))
    await readAllSseFrames(res)

    const calls = getEventCalls()
    const ingressCall = calls.find(c => c[0] === 'ingress_error')
    expect(ingressCall).toBeTruthy()
    const dims = ingressCall![1]
    expect(typeof dims['error_code']).toBe('string')
    expect((dims['error_code'] as string).length).toBeGreaterThan(0)
  })

  it('PII-absence: none of the dimension maps across all events contain the raw user message', async () => {
    mockStreamAnswer.mockResolvedValue(happyStreamResult())

    const rawMessage = 'my secret question about payroll process'
    const body = {
      role: 'consumer' as const,
      messages: [{ role: 'user', content: rawMessage }],
    }
    const res = await POST(makePost(body))
    await readAllSseFrames(res)

    // Iterate over ALL trackEvent calls; no dimension map should contain the
    // raw message text.
    const calls = getEventCalls()
    for (const [eventName, dims] of calls) {
      const serialised = JSON.stringify(dims)
      expect(
        serialised.includes(rawMessage),
        `event "${eventName}" dimension map contains raw user message`,
      ).toBe(false)
    }
  })

  it('chat_request_completed carries session_id_hash, user_id_hash, request_id, message_id correlation keys', async () => {
    mockStreamAnswer.mockResolvedValue(happyStreamResult())

    const res = await POST(makePost(validBody()))
    await readAllSseFrames(res)

    const calls = getEventCalls()
    const completedCall = calls.find(c => c[0] === 'chat_request_completed')
    expect(completedCall).toBeTruthy()
    const dims = completedCall![1]
    // request_id is always present (UUID)
    expect(dims['request_id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
    // message_id is always present (UUID)
    expect(dims['message_id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
    // session_id_hash and user_id_hash are set for authenticated local-dev stub
    // (sub='local-dev', email='local@dev' — both hashed to 16-hex)
    expect(dims['session_id_hash']).toMatch(/^[0-9a-f]{16}$/)
    expect(dims['user_id_hash']).toMatch(/^[0-9a-f]{16}$/)
  })
})

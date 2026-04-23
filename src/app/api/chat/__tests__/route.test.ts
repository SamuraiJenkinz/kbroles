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
  // Plan 05-03: override slot for getRequestUser return value. When null,
  // the mocked module delegates to the real implementation (so the existing
  // Phase-2 `process.env.NODE_ENV=production + no Authorization header →
  // {error:'unauthorized'}` test keeps exercising the real code path). When
  // set, the new Plan 05-03 discriminant tests inject {error:'token_expired'}
  // / {error:'wrong_tenant'} without having to synth real JWTs — synthesis
  // is covered by src/app/api/__tests__/_middleware.test.ts (Task 1).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authOverride: { value: any } = { value: null }
  return {
    capturedLines: lines as string[],
    logger,
    streamAnswerMock,
    authOverride,
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

// Plan 05-03: wrap the real _middleware module so override-less tests keep
// exercising the real validator (dev-permissive path, prod-no-header path),
// while the new discriminant tests can inject token_expired / wrong_tenant
// by setting mocks.authOverride.value. vi.importActual is hoisted-safe.
vi.mock('@/app/api/_middleware', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_middleware')>(
    '@/app/api/_middleware',
  )
  return {
    ...actual,
    getRequestUser: async (req: Request) => {
      if (mocks.authOverride.value !== null) return mocks.authOverride.value
      return actual.getRequestUser(req)
    },
  }
})

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

type SseFrame =
  | { type: 'answer_delta'; text: string }
  | { type: 'citations'; citations: unknown[] }
  | { type: 'fallback'; reason: string; text: string }
  | { type: 'done'; can_answer: boolean; validator_flips: number }
  | { type: 'error'; code: string; message: string }

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
    // Exactly 3 frames in LOCKED order per 02-CONTEXT.md §1 event ordering.
    expect(frames.map(f => f.type)).toEqual(['answer_delta', 'citations', 'done'])
    expect((frames[0] as { text: string }).text).toBe(
      'You can flag an article by raising a correction request.',
    )
    expect((frames[2] as { validator_flips: number }).validator_flips).toBe(0)
    expect((frames[2] as { can_answer: boolean }).can_answer).toBe(true)
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
    const lastLog = JSON.parse(capturedLines[capturedLines.length - 1]) as Record<string, unknown>
    expect(lastLog.fallback_reason).toBe('allowlist_violation')
    expect(lastLog.allowlist_violation).toEqual({ class: 'names', token_count: 1 })

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

    const lastLog = JSON.parse(capturedLines[capturedLines.length - 1]) as Record<string, unknown>
    expect(lastLog.ingress_status_code).toBe(502)
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
    const lastLog = JSON.parse(capturedLines[capturedLines.length - 1]) as Record<string, unknown>
    expect(lastLog.ingress_status_code).toBe(401)
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

    // The last captured log line is the terminal "chat request completed" info.
    const last = JSON.parse(capturedLines[capturedLines.length - 1]) as Record<string, unknown>
    expect(last.prompt_tokens).toBe(123)
    expect(last.completion_tokens).toBe(45)
    expect(last.request_id).toBeTruthy()
    expect(last.role).toBe('consumer')
    expect(last.host).toBe('web')
    expect(last.validator_flips).toBe(0)
    expect(last.refusal_fired).toBe(false)
    expect(last.fallback_reason).toBeNull()
    expect(last.ingress_status_code).toBe(200)
    expect(typeof last.latency_ms).toBe('number')
  })

  it('error path log has prompt_tokens=null + completion_tokens=null when streamAnswer throws before usage', async () => {
    mockStreamAnswer.mockRejectedValue(new Upstream5xxError(503))
    const res = await POST(makePost(validBody()))
    await readAllSseFrames(res)
    const last = JSON.parse(capturedLines[capturedLines.length - 1]) as Record<string, unknown>
    expect(last.prompt_tokens).toBeNull()
    expect(last.completion_tokens).toBeNull()
    expect(last.ingress_status_code).toBe(503)
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

    // Field-name forbidden list (matches src/obs/__tests__/logger.test.ts).
    for (const needle of ['user_question', 'messages', 'content', 'answer', 'quote']) {
      expect(whole.includes(needle), `log unexpectedly contains forbidden string "${needle}"`).toBe(false)
    }
    // Violating allowlist token must NEVER leak.
    expect(whole).not.toContain('Jane Doe')
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
// PLAN 05-03: AUTH DISCRIMINANTS (token_expired / wrong_tenant / unauthorized)
// =============================================================================
//
// These tests inject the three _middleware AuthResult error variants via the
// authOverride hook defined in the vi.mock factory above. Real-JWT synthesis
// is covered in src/app/api/__tests__/_middleware.test.ts (Task 1). Here we
// only verify the ROUTE'S translation of each variant → HTTP status + JSON
// body + structured log line.

describe('POST /api/chat — Plan 05-03 auth discriminants', () => {
  it('token_expired → 401 {error:"token_expired"} + X-Request-Id + log.warn with auth_result', async () => {
    mocks.authOverride.value = { error: 'token_expired' }

    const res = await POST(makePost(validBody()))

    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json')
    expect(res.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(((await res.json()) as { error: string }).error).toBe('token_expired')

    // log.warn fired once; no terminal log.info (single-log-per-completed-
    // request invariant: failed-auth paths land on warn, only successful
    // streams emit the terminal info). Find the auth-fail log line.
    const authLog = capturedLines
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .find(entry => entry.msg === 'chat auth failed')
    expect(authLog).toBeTruthy()
    expect(authLog?.auth_result).toBe('token_expired')
    expect(authLog?.ingress_status_code).toBe(401)
    expect(authLog?.level).toBe(40) // pino warn level
  })

  it('wrong_tenant → 403 {error:"access_denied"} + X-Request-Id + log.warn with auth_result', async () => {
    mocks.authOverride.value = { error: 'wrong_tenant' }

    const res = await POST(makePost(validBody()))

    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json')
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(((await res.json()) as { error: string }).error).toBe('access_denied')

    const authLog = capturedLines
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .find(entry => entry.msg === 'chat auth failed')
    expect(authLog?.auth_result).toBe('wrong_tenant')
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
    mocks.authOverride.value = {
      sub: 'entra-oid-abc-123',
      tenantId: '11111111-2222-3333-4444-555555555555',
      preferredUsername: 'alice@mmc.com',
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

    const last = JSON.parse(capturedLines[capturedLines.length - 1]) as Record<string, unknown>
    expect(last.msg).toBe('chat request completed')
    expect(last.auth_result).toBe('success')
    expect(last.sub).toBe('entra-oid-abc-123')
    // preferred_username + tid deliberately NOT logged to minimise PII
    // footprint. sub alone is enough for operator correlation.
    expect(last.preferred_username).toBeUndefined()
    expect(last.tenantId).toBeUndefined()
  })
})

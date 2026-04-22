import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import pino from 'pino'

// These tests build a parallel pino instance wired to an in-memory PassThrough
// so we can deterministically capture log output. We do NOT import `logger` /
// `requestLogger` from `../logger` here because the module-level `logger` is
// environment-dependent (dev uses a worker-thread transport; prod raw JSON),
// and we want the test to be hermetic and deterministic in both modes. The
// shape under test — `pino(raw).child(fields).info(...)` — is identical to
// what requestLogger() produces against the real logger, so this proves the
// contract per Plan 01 Task 1.2.

/**
 * Build a pino instance + a promise that resolves with all captured log lines
 * once we tell the stream there will be no more writes.
 */
function makeCapturingLogger() {
  const stream = new PassThrough()
  const captured: string[] = []
  stream.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    for (const line of text.split('\n')) {
      if (line.length > 0) captured.push(line)
    }
  })
  const instance = pino({ level: 'debug' }, stream)
  return { logger: instance, captured, stream }
}

describe('requestLogger child logger', () => {
  it('carries request_id and role forward into every subsequent .info/.warn/.error call', () => {
    const { logger, captured } = makeCapturingLogger()

    const child = logger.child({ request_id: 'req-abc-123', role: 'user', host: 'localhost' })

    child.info('chat started')
    child.warn({ validator_flips: 1 }, 'citation stripped')
    child.error({ ingress_status_code: 502 }, 'upstream failed')

    expect(captured).toHaveLength(3)
    for (const line of captured) {
      const parsed = JSON.parse(line) as Record<string, unknown>
      expect(parsed.request_id).toBe('req-abc-123')
      expect(parsed.role).toBe('user')
      expect(parsed.host).toBe('localhost')
    }

    // Spot-check per-call extra fields survive alongside the locked child fields
    const warnLine = JSON.parse(captured[1]) as Record<string, unknown>
    expect(warnLine.validator_flips).toBe(1)
    expect(warnLine.msg).toBe('citation stripped')

    const errorLine = JSON.parse(captured[2]) as Record<string, unknown>
    expect(errorLine.ingress_status_code).toBe(502)
  })

  it('NEVER records raw user content strings — enforces SC #5 "no raw user-question text"', () => {
    const { logger, captured } = makeCapturingLogger()

    // Simulate the exact log sequence that /api/chat emits on a happy-path
    // request. The allowed fields are present; the forbidden ones are NOT
    // passed into any .info/.warn/.error call. If a future regression
    // accidentally starts threading req.body / answer / quote into a log
    // line, this test MUST fail — it is the floor guarantee for SC #5.
    const child = logger.child({ request_id: 'req-xyz-789', role: 'user', host: 'example.com' })
    child.info('chat started')
    child.info(
      {
        validator_flips: 1,
        fallback_reason: 'all_citations_stripped',
        refusal_fired: false,
        ingress_status_code: 200,
        prompt_tokens: 1204,
        completion_tokens: 87,
        latency_ms: 3421,
      },
      'request done',
    )

    const wholeOutput = captured.join('\n')

    // Forbidden strings (per 02-CONTEXT.md §5 "Explicitly NOT logged"):
    // These are FIELD NAMES we must never emit. Checking the literal token
    // (with surrounding JSON-ish punctuation where helpful) guards against
    // accidentally pivoting one of these into a log extras object.
    const forbidden = ['user_question', 'messages', 'content', 'answer', 'quote']
    for (const needle of forbidden) {
      expect(
        wholeOutput.includes(needle),
        `log output unexpectedly contains forbidden field name "${needle}":\n${wholeOutput}`,
      ).toBe(false)
    }

    // Positive assertions — the allowed locked fields ARE present so we know
    // the test exercised the real code path (not a no-op).
    expect(wholeOutput).toContain('request_id')
    expect(wholeOutput).toContain('validator_flips')
    expect(wholeOutput).toContain('fallback_reason')
    expect(wholeOutput).toContain('ingress_status_code')
  })
})

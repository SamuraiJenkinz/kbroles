/**
 * Unit tests for src/obs/telemetry.ts — trackEvent() wrapper.
 *
 * Design constraints:
 *   - No live App Insights connection string required.
 *   - No network calls made during tests.
 *   - OTel API is fully mocked so the tests are deterministic and fast.
 *   - Pino logger is mocked to assert dual-emit behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted() runs before module mocks and before imports, so the factory
// functions inside vi.mock() can safely reference these variables.
// ---------------------------------------------------------------------------

const { mockSpanEnd, mockStartSpan, mockGetTracer, mockLoggerInfo } = vi.hoisted(() => {
  const mockSpanEnd = vi.fn()
  const mockStartSpan = vi.fn(() => ({ end: mockSpanEnd }))
  const mockGetTracer = vi.fn(() => ({ startSpan: mockStartSpan }))
  const mockLoggerInfo = vi.fn()
  return { mockSpanEnd, mockStartSpan, mockGetTracer, mockLoggerInfo }
})

// ---------------------------------------------------------------------------
// Mock @opentelemetry/api BEFORE importing telemetry.ts so the module-level
// `trace.getTracer(...)` call receives the mock tracer.
// ---------------------------------------------------------------------------

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: mockGetTracer },
  SpanKind: { INTERNAL: 'INTERNAL' },
}))

// ---------------------------------------------------------------------------
// Mock ./logger to intercept pino dual-emit without touching pino-pretty.
// ---------------------------------------------------------------------------

vi.mock('../logger', () => ({
  logger: { info: mockLoggerInfo },
}))

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are in place.
// ---------------------------------------------------------------------------

import { trackEvent } from '../telemetry'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('trackEvent()', () => {
  beforeEach(() => {
    mockSpanEnd.mockClear()
    mockStartSpan.mockClear()
    mockGetTracer.mockClear()
    mockLoggerInfo.mockClear()
  })

  it('calls tracer.startSpan with the event name, SpanKind.INTERNAL, and event.name attribute', () => {
    trackEvent('chat_request_completed')

    expect(mockStartSpan).toHaveBeenCalledOnce()
    const calls = mockStartSpan.mock.calls as unknown as Array<[string, { kind: unknown; attributes: Record<string, unknown> }]>
    const [spanName, options] = calls[0]
    expect(spanName).toBe('chat_request_completed')
    expect(options.kind).toBe('INTERNAL') // SpanKind.INTERNAL from mock
    expect(options.attributes['event.name']).toBe('chat_request_completed')
  })

  it('strips undefined dimension values — App Insights treats undefined as literal string', () => {
    trackEvent('test_event', { role: 'sme', question_hash: undefined })

    const calls = mockStartSpan.mock.calls as unknown as Array<[string, { kind: unknown; attributes: Record<string, unknown> }]>
    const [, options] = calls[0]
    expect(options.attributes['role']).toBe('sme')
    // undefined values must not appear in attrs at all
    expect('question_hash' in options.attributes).toBe(false)
  })

  it('strips empty-string dimension values — prevents noise dimensions in App Insights', () => {
    trackEvent('test_event', { role: '', session_id: 'abc123' })

    const calls = mockStartSpan.mock.calls as unknown as Array<[string, { kind: unknown; attributes: Record<string, unknown> }]>
    const [, options] = calls[0]
    expect(options.attributes['session_id']).toBe('abc123')
    // empty-string dimension must be omitted
    expect('role' in options.attributes).toBe(false)
  })

  it('strips non-finite measurement values (NaN and Infinity)', () => {
    trackEvent('test_event', {}, { latency_ms: 120, bad_nan: NaN, bad_inf: Infinity })

    const calls = mockStartSpan.mock.calls as unknown as Array<[string, { kind: unknown; attributes: Record<string, unknown> }]>
    const [, options] = calls[0]
    expect(options.attributes['latency_ms']).toBe(120)
    expect('bad_nan' in options.attributes).toBe(false)
    expect('bad_inf' in options.attributes).toBe(false)
  })

  it('calls span.end() exactly once per trackEvent() call', () => {
    trackEvent('test_event')

    expect(mockSpanEnd).toHaveBeenCalledOnce()
  })

  it('calls span.end() exactly once even when multiple dimensions and measurements are supplied', () => {
    trackEvent('test_event', { role: 'sme', host: 'localhost' }, { latency_ms: 200, token_count: 42 })

    expect(mockSpanEnd).toHaveBeenCalledOnce()
  })

  it('dual-emits to pino logger.info with event name as message', () => {
    trackEvent('test_event', { role: 'sme' }, { latency_ms: 50 })

    expect(mockLoggerInfo).toHaveBeenCalledOnce()
    const logCalls = mockLoggerInfo.mock.calls as unknown as Array<[Record<string, unknown>, string]>
    const [bindings, msg] = logCalls[0]
    expect(msg).toBe('test_event')
    expect(bindings['event']).toBe('test_event')
    expect(bindings['role']).toBe('sme')
    expect(bindings['latency_ms']).toBe(50)
  })

  it('pino dual-emit includes the event name binding even with no dimensions', () => {
    trackEvent('bare_event')

    expect(mockLoggerInfo).toHaveBeenCalledOnce()
    const logCalls = mockLoggerInfo.mock.calls as unknown as Array<[Record<string, unknown>, string]>
    const [bindings, msg] = logCalls[0]
    expect(msg).toBe('bare_event')
    expect(bindings['event']).toBe('bare_event')
  })

  it('forwards valid string dimensions and finite measurements as span attributes', () => {
    trackEvent('chip_vs_freeform', { chip_or_freeform: 'chip', role: 'hr' }, { token_count: 99 })

    const calls = mockStartSpan.mock.calls as unknown as Array<[string, { kind: unknown; attributes: Record<string, unknown> }]>
    const [, options] = calls[0]
    expect(options.attributes['chip_or_freeform']).toBe('chip')
    expect(options.attributes['role']).toBe('hr')
    expect(options.attributes['token_count']).toBe(99)
  })

  it('is synchronous — returns undefined (not a Promise)', () => {
    const result = trackEvent('sync_check')

    expect(result).toBeUndefined()
    // If it returned a Promise the span.end spy would also be called
    // asynchronously — asserting it was called here confirms sync execution.
    expect(mockSpanEnd).toHaveBeenCalledOnce()
  })
})

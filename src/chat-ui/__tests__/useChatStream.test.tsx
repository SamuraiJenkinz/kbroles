// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useChatStream } from '../useChatStream'

// ─── SSE stream builder helper ─────────────────────────────────────────────────
function makeSseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const f of frames) {
        controller.enqueue(encoder.encode(`data: ${f}\n\n`))
      }
      controller.close()
    },
  })
}

// ─── Helper to build a Response with SSE body and headers ─────────────────────
function makeSseResponse(frames: string[], requestId = 'test-req-1'): Response {
  return new Response(makeSseStream(frames), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'X-Request-Id': requestId,
    },
  })
}

describe('useChatStream', () => {
  let onEvent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onEvent = vi.fn()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── Happy path ──────────────────────────────────────────────────────────────

  it('happy path: fires answer_delta × 2, citations, done in order with correct requestId', async () => {
    const frames = [
      '{"type":"answer_delta","text":"Hello "}',
      '{"type":"answer_delta","text":"world"}',
      '{"type":"citations","citations":[]}',
      '{"type":"done","can_answer":true,"validator_flips":0}',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeSseResponse(frames, 'test-req-1')))

    const { result } = renderHook(() => useChatStream(onEvent))

    await act(async () => {
      await result.current.send('consumer', [{ role: 'user', content: 'hi' }])
    })

    expect(onEvent).toHaveBeenCalledTimes(4)
    expect(onEvent.mock.calls[0][0]).toEqual({ type: 'answer_delta', text: 'Hello ' })
    expect(onEvent.mock.calls[1][0]).toEqual({ type: 'answer_delta', text: 'world' })
    expect(onEvent.mock.calls[2][0]).toEqual({ type: 'citations', citations: [] })
    expect(onEvent.mock.calls[3][0]).toEqual({ type: 'done', can_answer: true, validator_flips: 0 })
    // All calls received correct requestId
    for (const call of onEvent.mock.calls) {
      expect(call[1]).toBe('test-req-1')
    }
    // isStreaming should be false after done settles
    expect(result.current.isStreaming).toBe(false)
  })

  // ─── Fallback terminal ────────────────────────────────────────────────────────

  it('fallback terminal: emits answer_delta then fallback; closes after fallback', async () => {
    const frames = [
      '{"type":"answer_delta","text":"partial..."}',
      '{"type":"fallback","reason":"can_answer_false","text":"Sorry, I cannot answer that."}',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeSseResponse(frames, 'req-fallback')))

    const { result } = renderHook(() => useChatStream(onEvent))
    await act(async () => {
      await result.current.send('consumer', [{ role: 'user', content: 'test' }])
    })

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent.mock.calls[0][0]).toMatchObject({ type: 'answer_delta' })
    expect(onEvent.mock.calls[1][0]).toMatchObject({ type: 'fallback', reason: 'can_answer_false' })
    expect(result.current.isStreaming).toBe(false)
  })

  // ─── Error terminal (wire-level error frame) ─────────────────────────────────

  it('error terminal: emits one error event from stream error frame', async () => {
    const frames = ['{"type":"error","code":"upstream_5xx","message":"upstream failed"}']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeSseResponse(frames, 'req-err')))

    const { result } = renderHook(() => useChatStream(onEvent))
    await act(async () => {
      await result.current.send('consumer', [{ role: 'user', content: 'test' }])
    })

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent.mock.calls[0][0]).toMatchObject({ type: 'error', code: 'upstream_5xx' })
    expect(result.current.isStreaming).toBe(false)
  })

  // ─── Pitfall 4 — role-contamination regression (CRITICAL) ────────────────────

  it('Pitfall 4 — role-contamination: each send call carries its own role, never leaks prior role', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeSseResponse(['{"type":"done","can_answer":true,"validator_flips":0}'], 'req-1'))
      .mockResolvedValueOnce(makeSseResponse(['{"type":"done","can_answer":true,"validator_flips":0}'], 'req-2'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useChatStream(onEvent))

    // First send with 'consumer'
    await act(async () => {
      await result.current.send('consumer', [{ role: 'user', content: 'Q1' }])
    })
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(firstBody.role).toBe('consumer')

    // Second send with 'author'
    await act(async () => {
      await result.current.send('author', [{ role: 'user', content: 'Q2' }])
    })
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(secondBody.role).toBe('author')

    // Neither call should have the other's role
    expect(firstBody.role).not.toBe('author')
    expect(secondBody.role).not.toBe('consumer')
  })

  // ─── Pitfall 5 — AbortError discrimination ────────────────────────────────────

  it('Pitfall 5 — AbortError discrimination: stop() does not emit error event', async () => {
    // Mock fetch to throw AbortError when the signal fires
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = options?.signal as AbortSignal
        if (signal?.aborted) {
          reject(new DOMException('aborted', 'AbortError'))
          return
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
        // Never resolve — simulates in-flight request
      })
    }))

    const { result } = renderHook(() => useChatStream(onEvent))

    // Start send without awaiting
    const sendPromise = act(async () => {
      const p = result.current.send('consumer', [{ role: 'user', content: 'test' }])
      // Stop immediately after initiating
      result.current.stop()
      await p
    })

    await sendPromise

    // onEvent must NOT have been called with type:'error'
    const errorCalls = onEvent.mock.calls.filter(c => c[0]?.type === 'error')
    expect(errorCalls).toHaveLength(0)
    // isStreaming becomes false after send settles
    expect(result.current.isStreaming).toBe(false)
  })

  // ─── Pre-stream 4xx (contract §7) ────────────────────────────────────────────

  it('pre-stream 4xx: emits error with body.error and correct requestId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'role_invalid' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'err-req-1' },
      })
    ))

    const { result } = renderHook(() => useChatStream(onEvent))
    await act(async () => {
      await result.current.send('consumer', [{ role: 'user', content: 'test' }])
    })

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent.mock.calls[0][0]).toEqual({ type: 'error', code: 'internal', message: 'role_invalid' })
    expect(onEvent.mock.calls[0][1]).toBe('err-req-1')
    expect(result.current.isStreaming).toBe(false)
  })

  // ─── Pre-stream 429 with Retry-After ─────────────────────────────────────────

  it('pre-stream 429: emits rate_limited error with retry hint from Retry-After header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '5',
          'X-Request-Id': 'rl-req-1',
        },
      })
    ))

    const { result } = renderHook(() => useChatStream(onEvent))
    await act(async () => {
      await result.current.send('consumer', [{ role: 'user', content: 'test' }])
    })

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent.mock.calls[0][0]).toEqual({ type: 'error', code: 'internal', message: 'rate_limited:5' })
    expect(onEvent.mock.calls[0][1]).toBe('rl-req-1')
  })

  // ─── Partial-frame buffering ──────────────────────────────────────────────────

  it('partial-frame buffering: split chunk still produces one complete answer_delta', async () => {
    const encoder = new TextEncoder()
    const fullFrame = 'data: {"type":"answer_delta","text":"hello"}\n\n'
    const splitPoint = fullFrame.indexOf('"te') + 2  // split mid-key to test buffering
    const chunk1 = encoder.encode(fullFrame.slice(0, splitPoint))
    const chunk2 = encoder.encode(fullFrame.slice(splitPoint))

    let callCount = 0
    const splitStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk1)
        controller.enqueue(chunk2)
        // Close after emitting a done frame too
        controller.enqueue(encoder.encode('data: {"type":"done","can_answer":true,"validator_flips":0}\n\n'))
        controller.close()
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response(splitStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'X-Request-Id': 'split-req' },
      })
    ))

    const { result } = renderHook(() => useChatStream(onEvent))
    await act(async () => {
      await result.current.send('consumer', [{ role: 'user', content: 'test' }])
    })

    // Should have received exactly one answer_delta (complete, not split)
    const deltaCalls = onEvent.mock.calls.filter(c => c[0]?.type === 'answer_delta')
    expect(deltaCalls).toHaveLength(1)
    expect(deltaCalls[0][0]).toEqual({ type: 'answer_delta', text: 'hello' })
  })

  // ─── Send-while-streaming aborts prior fetch ──────────────────────────────────

  it('send-while-streaming: second send aborts first fetch and issues with new role + fresh signal', async () => {
    let firstSignal: AbortSignal | undefined
    let resolveFirstFetch: ((r: Response) => void) | undefined

    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, options: RequestInit) => {
        firstSignal = options?.signal as AbortSignal
        // Return a promise that never resolves — simulates a hung request
        // The AbortController signal will fire when stop() is called, but since
        // this is a pending fetch promise (not a stream read), the test can
        // just verify the signal was aborted without waiting for the promise.
        return new Promise<Response>((resolve) => {
          resolveFirstFetch = resolve
          // Listen for abort and let the promise reject
          firstSignal?.addEventListener('abort', () => {
            // Don't reject — just let the second send proceed
          })
        })
      })
      .mockResolvedValueOnce(
        makeSseResponse(['{"type":"done","can_answer":true,"validator_flips":0}'], 'req-2')
      )

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useChatStream(onEvent))

    // Start first send without awaiting (it's pending)
    const firstSend = result.current.send('consumer', [{ role: 'user', content: 'Q1' }])

    // Flush microtasks so the first fetch call is registered
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
    })

    // Verify first fetch was called with 'consumer'
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(firstBody.role).toBe('consumer')
    expect(firstSignal).toBeDefined()
    expect(firstSignal?.aborted).toBe(false)

    // Second send — this calls stop() internally which aborts the first fetch's signal
    await act(async () => {
      await result.current.send('author', [{ role: 'user', content: 'Q2' }])
    })

    // First signal should have been aborted by stop() inside the second send
    expect(firstSignal?.aborted).toBe(true)

    // Second fetch should have been called with role 'author'
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(secondBody.role).toBe('author')

    // Second fetch's signal must be a fresh (non-aborted) signal
    const secondSignal = (fetchMock.mock.calls[1][1] as RequestInit).signal as AbortSignal
    expect(secondSignal.aborted).toBe(false)

    // Clean up dangling promise by resolving the never-settling first fetch
    resolveFirstFetch?.(makeSseResponse([], 'cleanup'))
    await Promise.allSettled([firstSend])
  }, 10000)

  // ─── isStreaming flag lifecycle ───────────────────────────────────────────────

  it('isStreaming is false before send and false after terminal done', async () => {
    const localOnEvent = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      makeSseResponse(['{"type":"done","can_answer":true,"validator_flips":0}'], 'req-iso')
    ))

    const { result } = renderHook(() => useChatStream(localOnEvent))
    expect(result.current.isStreaming).toBe(false)

    await act(async () => {
      await result.current.send('consumer', [{ role: 'user', content: 'test' }])
    })

    expect(result.current.isStreaming).toBe(false)
  })
})

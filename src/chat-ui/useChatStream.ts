/* Pitfall 4 guard: role is a parameter of send() on every call. Do not promote it to hook state. */
'use client'
import { useCallback, useRef, useState } from 'react'
import type { Role, SseEvent } from './types'

export function useChatStream(onEvent: (ev: SseEvent, requestId: string) => void) {
  const abortRef = useRef<AbortController | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  const send = useCallback(
    async (role: Role, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
      stop()                                   // abort any prior stream FIRST
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setIsStreaming(true)

      let requestId = 'unknown'
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, messages }),
          signal: ctrl.signal,
        })
        requestId = res.headers.get('X-Request-Id') ?? 'unknown'

        if (!res.ok) {
          if (res.status === 429) {
            const retryAfter = Number(res.headers.get('Retry-After') ?? '5')
            onEvent(
              { type: 'error', code: 'internal', message: `rate_limited:${retryAfter}` },
              requestId,
            )
            return
          }
          const body = await res.json().catch(() => ({} as { error?: string }))
          onEvent(
            { type: 'error', code: 'internal', message: body.error ?? `http_${res.status}` },
            requestId,
          )
          return
        }
        if (!res.body) {
          onEvent({ type: 'error', code: 'internal', message: 'missing_body' }, requestId)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { value, done } = await reader.read()
          if (value) buffer += decoder.decode(value, { stream: !done })
          if (done) break
          let sep: number
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, sep)
            buffer = buffer.slice(sep + 2)
            const match = frame.match(/^data: (.*)$/s)
            if (!match) continue
            const ev = JSON.parse(match[1]) as SseEvent
            onEvent(ev, requestId)
            if (ev.type === 'done' || ev.type === 'fallback' || ev.type === 'error') {
              reader.cancel().catch(() => {})
              return
            }
          }
        }
      } catch (err) {
        // Pitfall 5: AbortError is user-initiated (stop()); do NOT surface as error.
        if (err instanceof DOMException && err.name === 'AbortError') return
        onEvent(
          { type: 'error', code: 'internal', message: String(err) },
          requestId,
        )
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [stop, onEvent],
  )

  return { send, stop, isStreaming }
}

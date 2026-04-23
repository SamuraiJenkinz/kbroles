/* Pitfall 4 guard: role is a parameter of send() on every call. Do not promote it to hook state. */
'use client'
import { useCallback, useRef, useState } from 'react'
import type { Role, SseEvent } from './types'

/**
 * Pitfall 4 guard: role is a parameter of send() on every call. Do not
 * promote it to hook state.
 *
 * Phase 5.1 — BFF session-cookie auth. The hook makes plain `fetch('/api/chat',
 * { credentials: 'include' })` calls; the iron-session cookie is sent
 * automatically by the browser. No Authorization header, no token
 * acquisition. Pre-stream 401/403 branching PRESERVED — server emits
 * {error:'token_expired'}/'unauthorized'/'access_denied' JSON bodies on
 * the pre-stream response, hook dispatches assistant/error with the
 * matching code. Caller (ChatSurface) handles navigation for
 * access_denied via router (see ChatPage) — this hook no longer needs the
 * onAccessDenied callback.
 *
 * Options type retained (empty for now) so callers that pass `{}` as a
 * placeholder compile cleanly. If future non-auth options land they belong
 * here.
 */
export type UseChatStreamOptions = Record<string, never>

export function useChatStream(
  onEvent: (ev: SseEvent, requestId: string) => void,
  _opts: UseChatStreamOptions = {},
) {
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
          credentials: 'include',  // Phase 5.1 — send iron-session cookie
          body: JSON.stringify({ role, messages }),
          signal: ctrl.signal,
        })
        requestId = res.headers.get('X-Request-Id') ?? 'unknown'

        // ─── Pre-stream 401/403 branching (Phase 5.1) ──────────────────────
        // Auth failures are delivered as HTTP status + JSON body (NOT SSE
        // frames). /api/chat pre-stream-401s on token_expired/unauthorized
        // and pre-stream-403s on access_denied — the SSE stream is never
        // started for auth failures. Branch BEFORE entering the reader.
        //
        // Semantics changed from Phase 5: "token_expired" now means the
        // iron-session cookie has expired (no more JWT-in-Authorization).
        // Wire code preserved so ErrorCard + chatReducer stay stable.
        if (res.status === 401) {
          const body = await res.json().catch(() => ({} as { error?: string }))
          if (body.error === 'token_expired') {
            onEvent({ type: 'error', code: 'token_expired', message: 'token_expired' }, requestId)
            return
          }
          // body.error === 'unauthorized' or any other 401: wire as internal
          // with a sentinel message so ErrorCard still renders. ErrorCode
          // does not include 'unauthorized' — we keep the diff small and
          // rely on the 'internal' fallback title.
          onEvent(
            { type: 'error', code: 'internal', message: body.error ?? 'unauthorized' },
            requestId,
          )
          return
        }
        if (res.status === 403) {
          const body = await res.json().catch(() => ({} as { error?: string }))
          // access_denied: surface via the existing error path with an
          // 'internal' sentinel. ChatPage's useAuth() forbidden branch is
          // the canonical /access-denied route; an in-flight 403 during
          // chat means the user's roles changed server-side between
          // AuthProvider's /api/me resolve and the send. We render an
          // error card so the user isn't silently ejected mid-stream.
          onEvent(
            { type: 'error', code: 'internal', message: body.error ?? `http_${res.status}` },
            requestId,
          )
          return
        }

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

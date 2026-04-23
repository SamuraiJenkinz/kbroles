/* Pitfall 4 guard: role is a parameter of send() on every call. Do not promote it to hook state. */
'use client'
import { useCallback, useRef, useState } from 'react'
import type { Role, SseEvent } from './types'

/**
 * Options for useChatStream. All new fields are OPTIONAL by design so that
 * existing Phase-3 unit tests (which omit them) continue to pass without
 * MSAL mocks.
 *
 * Plan 05-04 Task 2 Edit A — dependency-injected token provider.
 * Plan 05-04 Task 2 Edit B — pre-stream 401/403 branching for token_expired
 * / unauthorized / access_denied.
 *
 * IMPORTANT: This file does NOT top-level-import @/auth/tokenProvider. Static
 * import would force MSAL into every Phase-3 useChatStream test. ChatSurface
 * (which lives inside MsalProvider) supplies the bound callback.
 */
export type UseChatStreamOptions = {
  /**
   * Bound `tokenProvider.acquireToken` callback. Invoked before each
   * /api/chat fetch; if it returns a non-empty string, the hook attaches
   * `Authorization: Bearer <token>` to the request.
   */
  acquireToken?: () => Promise<string | null>
  /**
   * Fired AFTER a pre-stream 401 with `{error:"token_expired"}` body has been
   * dispatched as assistant/error. Lets ChatSurface proactively trigger a
   * silent refresh if desired. Retry remains user-initiated through the
   * ErrorCard's "Sign back in" button (ChatSurface re-invokes acquireToken
   * before replaying the send).
   */
  onTokenExpired?: () => void
  /**
   * Fired AFTER a pre-stream 403 with `{error:"access_denied"}` body. Lets
   * ChatSurface perform `router.replace('/access-denied')`. No error action
   * is dispatched for access_denied — the caller owns navigation.
   */
  onAccessDenied?: () => void
}

export function useChatStream(
  onEvent: (ev: SseEvent, requestId: string) => void,
  opts: UseChatStreamOptions = {},
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
        // ─── Plan 05-04 Edit A: attach Bearer token via injected callback ──
        let authHeader: Record<string, string> = {}
        if (opts.acquireToken) {
          try {
            const token = await opts.acquireToken()
            if (token) authHeader = { Authorization: `Bearer ${token}` }
          } catch {
            // Silent + interactive both failed. Surface via the existing
            // error path with code:'internal' + sentinel message so ErrorCard
            // renders. The user can retry, which re-invokes acquireToken and
            // follows the interactive path again.
            onEvent(
              { type: 'error', code: 'internal', message: 'acquire_token_failed' },
              requestId,
            )
            setIsStreaming(false)
            abortRef.current = null
            return
          }
        }

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ role, messages }),
          signal: ctrl.signal,
        })
        requestId = res.headers.get('X-Request-Id') ?? 'unknown'

        // ─── Plan 05-04 Edit B: pre-stream 401/403 branching ───────────────
        // Auth failures are delivered as HTTP status + JSON body (NOT SSE
        // frames). Plan 05-03 pre-stream-401s on token_expired/unauthorized
        // and pre-stream-403s on access_denied — the SSE stream is never
        // started for auth failures. Branch BEFORE entering the reader.
        if (res.status === 401) {
          const body = await res.json().catch(() => ({} as { error?: string }))
          if (body.error === 'token_expired') {
            onEvent({ type: 'error', code: 'token_expired', message: 'token_expired' }, requestId)
            opts.onTokenExpired?.()
            return
          }
          // body.error === 'unauthorized' or any other 401: wire as internal
          // with a sentinel message so ErrorCard still renders. Plan 05-02
          // did not add 'unauthorized' to ErrorCode — we keep the diff small
          // and rely on the 'internal' fallback title.
          onEvent(
            { type: 'error', code: 'internal', message: body.error ?? 'unauthorized' },
            requestId,
          )
          return
        }
        if (res.status === 403) {
          const body = await res.json().catch(() => ({} as { error?: string }))
          if (body.error === 'access_denied') {
            // Access denied — caller navigates to /access-denied. No error
            // dispatch because the user leaves the chat surface entirely.
            opts.onAccessDenied?.()
            return
          }
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
    [stop, onEvent, opts],
  )

  return { send, stop, isStreaming }
}

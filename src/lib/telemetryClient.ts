/**
 * Browser-safe telemetry client helpers (Phase 6 — Plan 03).
 *
 * Two exported functions that wrap navigator.sendBeacon (primary) with a
 * fetch + keepalive fallback. Both helpers swallow errors and never throw
 * out to the caller — a telemetry failure must NEVER break the UI.
 *
 * Design choices:
 *   - sendBeacon is preferred because it is queued by the browser and
 *     survives navigation/page-close events (important for 👎 click-then-
 *     navigate scenarios).
 *   - fetch + keepalive fires even if the page is being unloaded and the
 *     connection is still open (HTTP/1.1 keep-alive = don't close socket).
 *   - credentials: 'include' ensures the iron-session cookie is sent so
 *     the BFF routes can authenticate the request.
 *   - All catch paths call console.warn (not console.error) to distinguish
 *     telemetry noise from real application errors.
 *
 * SLA: < 5 s server-side round trip per SC#4. These helpers are fire-and-
 * forget by design — the return Promise resolves once the network call is
 * dispatched, not when the server responds.
 */

export type FeedbackPayload = {
  message_id: string
  rating: 'up' | 'down'
  reason?: 'hallucinated' | 'wrong citation' | 'incomplete' | 'other'
  citation_source_id?: string
  citation_section_id?: string
}

/**
 * Sends a 👍/👎 rating to POST /api/feedback.
 * Uses sendBeacon if available; falls back to fetch + keepalive.
 * Never throws — telemetry failure must not break the UI.
 */
export async function sendFeedback(p: FeedbackPayload): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        '/api/feedback',
        new Blob([JSON.stringify(p)], { type: 'application/json' }),
      )
      if (ok) return
    }
    // Fallback: fetch with keepalive so the request survives navigation.
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify(p),
    })
  } catch (err) {
    console.warn('[telemetryClient] sendFeedback failed:', err)
  }
}

/**
 * Sends a generic client-side event to POST /api/telemetry.
 * Allowed names: 'citation_click_through' | 'flag_a_gap_action'.
 * Uses sendBeacon if available; falls back to fetch + keepalive.
 * Never throws.
 */
export async function sendClientEvent(
  name: 'citation_click_through' | 'flag_a_gap_action',
  message_id: string,
  dimensions: Record<string, string> = {},
): Promise<void> {
  const body = JSON.stringify({ name, message_id, dimensions })
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        '/api/telemetry',
        new Blob([body], { type: 'application/json' }),
      )
      if (ok) return
    }
    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body,
    })
  } catch (err) {
    console.warn('[telemetryClient] sendClientEvent failed:', err)
  }
}
